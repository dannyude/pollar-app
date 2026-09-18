"""Persistence for orders and their timeline.

Only reads and writes: no business decisions. A status change and its event are
always written together, so the timeline can't miss a transition."""

from datetime import datetime
from typing import Any
from uuid import UUID

import asyncpg

from ..domain.models import Actor, EscrowEnvelope, NewOrder, Order, OrderEvent, PayoutKind

CLOSED_STATUSES = ["completed", "refunded", "expired"]

_TRANSITION_COLUMNS = frozenset({"agent_reference", "funding_tx", "locked_at", "fiat_sent_at", "completed_at", "dispute_reason"})
_ENVELOPE_COLUMNS = {
    PayoutKind.RELEASE: ("release_tx", "release_xdr", "release_max_time"),
    PayoutKind.REFUND: ("refund_tx", "refund_xdr", "refund_max_time"),
}


class DuplicateIdempotencyKey(Exception):
    """This user already opened an order with that Idempotency-Key."""


class DuplicateRef(Exception):
    """Another order already has this reference."""


class DuplicateFundingTx(Exception):
    """This Stellar payment already funds another order."""


# ─── Reads ──────────────────────────────────────────────────────────────────────


async def get(conn: asyncpg.Connection, order_id: UUID, *, for_update: bool = False) -> Order | None:
    row = await conn.fetchrow("select * from orders where id = $1" + (" for update" if for_update else ""), order_id)
    return to_order(row) if row else None


async def list_for_user(conn: asyncpg.Connection, user_id: str, *, open_only: bool) -> list[Order]:
    rows = await conn.fetch(
        "select * from orders where user_id = $1 and (not $2 or status <> all($3::text[])) order by created_at desc limit 100",
        user_id,
        open_only,
        CLOSED_STATUSES,
    )
    return [to_order(r) for r in rows]


async def list_for_agent(conn: asyncpg.Connection, agent_id: UUID, *, open_only: bool) -> list[Order]:
    rows = await conn.fetch(
        "select * from orders where agent_id = $1 and (not $2 or status <> all($3::text[])) order by created_at desc limit 100",
        agent_id,
        open_only,
        CLOSED_STATUSES,
    )
    return [to_order(r) for r in rows]


async def count_open_for_agent(conn: asyncpg.Connection, agent_id: UUID) -> int:
    return await conn.fetchval("select count(*) from orders where agent_id = $1 and status <> all($2::text[])", agent_id, CLOSED_STATUSES)


async def events(conn: asyncpg.Connection, order_id: UUID) -> list[OrderEvent]:
    rows = await conn.fetch("select from_status, to_status, actor, meta, created_at from order_events where order_id = $1 order by id", order_id)
    return [OrderEvent(r["from_status"], r["to_status"], r["actor"], r["meta"], r["created_at"]) for r in rows]


async def due_to_expire(conn: asyncpg.Connection, now: datetime) -> list[UUID]:
    rows = await conn.fetch("select id from orders where status in ('awaiting_fiat', 'awaiting_usdc') and expires_at <= $1", now)
    return [r["id"] for r in rows]


async def due_to_auto_complete(conn: asyncpg.Connection, paid_before: datetime) -> list[UUID]:
    rows = await conn.fetch("select id from orders where type = 'cash_out' and status = 'fiat_sent' and fiat_sent_at <= $1", paid_before)
    return [r["id"] for r in rows]


async def settling_since(conn: asyncpg.Connection, updated_before: datetime) -> list[UUID]:
    """Orders with a saved escrow payment that hasn't been confirmed recently."""
    rows = await conn.fetch(
        """select id from orders
           where ((status = 'releasing' and release_tx is not null) or (status = 'refunding' and refund_tx is not null))
             and updated_at <= $1""",
        updated_before,
    )
    return [r["id"] for r in rows]


# ─── Writes ─────────────────────────────────────────────────────────────────────


async def by_ref(conn: asyncpg.Connection, ref: str) -> Order | None:
    row = await conn.fetchrow("select * from orders where ref = $1", ref)
    return to_order(row) if row else None


async def by_idempotency_key(conn: asyncpg.Connection, user_id: str, key: str) -> Order | None:
    row = await conn.fetchrow("select * from orders where user_id = $1 and idempotency_key = $2", user_id, key)
    return to_order(row) if row else None


async def insert(conn: asyncpg.Connection, new: NewOrder, *, meta: dict[str, Any]) -> Order:
    try:
        row = await conn.fetchrow(
            """insert into orders (ref, type, status, user_id, agent_id, user_wallet, currency,
                                   fiat_amount, usdc_amount, rate, pay_details, payout_details, expires_at,
                                   idempotency_key)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
               returning *""",
            new.ref,
            new.type,
            new.status,
            new.user.id,
            new.agent.id,
            new.user.wallet,
            new.agent.currency,
            new.fiat_amount,
            new.usdc_amount,
            new.rate,
            new.pay_details,
            new.payout_details,
            new.expires_at,
            new.idempotency_key,
        )
    except asyncpg.UniqueViolationError as exc:
        if exc.constraint_name == "orders_ref_key":
            raise DuplicateRef from exc
        if exc.constraint_name == "orders_idempotency_uq":
            raise DuplicateIdempotencyKey from exc
        raise
    order = to_order(row)
    await _add_event(conn, order.id, None, order.status, "user", meta)
    return order


async def record_transition(
    conn: asyncpg.Connection,
    order: Order,
    to_status: str,
    *,
    actor: Actor,
    meta: dict[str, Any] | None = None,
    **changes: Any,
) -> bool:
    """Moves the order from the status it was read with to `to_status` and logs the
    event. Returns False, changing nothing, if the order has moved on since."""
    unknown = set(changes) - _TRANSITION_COLUMNS
    if unknown:
        raise ValueError(f"Not changeable in a transition: {sorted(unknown)}")
    assignments = ", ".join(["status = $3", "updated_at = now()", *(f"{c} = ${i}" for i, c in enumerate(changes, start=4))])
    try:
        result = await conn.execute(
            f"update orders set {assignments} where id = $1 and status = $2", order.id, order.status, to_status, *changes.values()
        )
    except asyncpg.UniqueViolationError as exc:
        if exc.constraint_name == "orders_funding_tx_key":
            raise DuplicateFundingTx from exc
        raise
    if result != "UPDATE 1":
        return False
    await _add_event(conn, order.id, order.status, to_status, actor, meta)
    return True


async def record_note(conn: asyncpg.Connection, order: Order, *, actor: Actor, meta: dict[str, Any]) -> None:
    """Logs something that happened to the order without changing its status."""
    await _add_event(conn, order.id, order.status, order.status, actor, meta)


async def save_envelope(conn: asyncpg.Connection, order: Order, kind: PayoutKind, envelope: EscrowEnvelope) -> None:
    tx_col, xdr_col, time_col = _ENVELOPE_COLUMNS[kind]
    await conn.execute(
        f"update orders set {tx_col} = $2, {xdr_col} = $3, {time_col} = $4, updated_at = now() where id = $1",
        order.id,
        envelope.hash,
        envelope.xdr,
        envelope.max_time,
    )


async def touch(conn: asyncpg.Connection, order_id: UUID) -> None:
    await conn.execute("update orders set updated_at = now() where id = $1", order_id)


async def _add_event(conn: asyncpg.Connection, order_id: UUID, from_status: str | None, to_status: str, actor: Actor, meta: dict[str, Any] | None) -> None:
    await conn.execute(
        "insert into order_events (order_id, from_status, to_status, actor, meta) values ($1, $2, $3, $4, $5)",
        order_id,
        from_status,
        to_status,
        actor,
        meta or {},
    )


# ─── Row mapping ────────────────────────────────────────────────────────────────


def to_order(row: asyncpg.Record) -> Order:
    return Order(
        id=row["id"],
        ref=row["ref"],
        type=row["type"],
        status=row["status"],
        user_id=row["user_id"],
        agent_id=row["agent_id"],
        user_wallet=row["user_wallet"],
        currency=row["currency"],
        fiat_amount=row["fiat_amount"],
        usdc_amount=row["usdc_amount"],
        rate=row["rate"],
        pay_details=row["pay_details"],
        payout_details=row["payout_details"],
        agent_reference=row["agent_reference"],
        funding_tx=row["funding_tx"],
        release=_envelope(row, "release"),
        refund=_envelope(row, "refund"),
        dispute_reason=row["dispute_reason"],
        expires_at=row["expires_at"],
        locked_at=row["locked_at"],
        fiat_sent_at=row["fiat_sent_at"],
        completed_at=row["completed_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _envelope(row: asyncpg.Record, prefix: str) -> EscrowEnvelope | None:
    tx_hash = row[f"{prefix}_tx"]
    return EscrowEnvelope(tx_hash, row[f"{prefix}_xdr"], row[f"{prefix}_max_time"]) if tx_hash else None
