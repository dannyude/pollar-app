"""The add-money and cash-out lifecycles, as plain functions.

Every change to an order goes through one of the named behaviors below. Each one
receives its dependencies explicitly, asks the pure rules in `domain/` what may
happen, and then performs the effects through repositories and gateways."""

import secrets
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, replace
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg

from ..deps import Deps
from ..domain import lifecycle
from ..domain.errors import AppError, ErrorKind, order_not_found
from ..domain.floats import ensure_can_reserve
from ..domain.funding import attach_decision, ensure_can_hold_usdc, verify_cash_out_funding
from ..domain.lifecycle import SETTLED, SETTLING, Action, Decision
from ..domain.models import Actor, Agent, NewOrder, Order, OrderEvent, OrderType, PayoutKind, Role, User
from ..domain.money import fmt_fiat, fmt_rate, fmt_usdc
from ..domain.payouts import should_record_settled
from ..domain.pricing import quote
from ..domain.rails import validate_details
from ..gateways import stellar
from ..repositories import agents as agent_repo
from ..repositories import orders as order_repo
from ..repositories.db import transaction
from ..repositories.orders import DuplicateFundingTx, DuplicateRef
from .payouts import PayoutResult, pay_out

REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

Apply = Callable[[asyncpg.Connection, Order, Role, datetime], Awaitable[None]]


@dataclass(frozen=True)
class OrderSnapshot:
    """An order as one of its two parties sees it right now."""

    order: Order
    agent: Agent
    role: Role
    actions: list[Action]
    refund_available_at: datetime | None
    events: list[OrderEvent] | None = None
    pending: bool = False  # an escrow payment is still landing


# ─── Add money (cash_in) ────────────────────────────────────────────────────────


async def open_cash_in(deps: Deps, user: User, *, agent_id: UUID, fiat_amount: Decimal | None = None, usdc_amount: Decimal | None = None) -> OrderSnapshot:
    """The customer asks an agent for USDC and is told where to send fiat."""
    await _agent_for(deps, user, agent_id)
    # Check before the customer pays: USDC can only be released to a wallet that can hold it.
    ensure_can_hold_usdc(await stellar.fetch_account(deps.stellar, user.wallet))
    return await _open(deps, user, "cash_in", agent_id, fiat_amount, usdc_amount, payout_details=None)


async def mark_cash_in_paid(deps: Deps, user: User, order_id: UUID) -> OrderSnapshot:
    """The customer says they sent fiat to the agent. On its own this releases nothing."""

    async def mark(conn: asyncpg.Connection, order: Order, role: Role, now: datetime) -> None:
        await order_repo.record_transition(conn, order, "fiat_sent", actor="user", meta={"note": "Customer says the payment was sent."}, fiat_sent_at=now)

    await _act(deps, user, order_id, Action.FIAT_SENT, mark, order_type="cash_in")
    return await get(deps, user, order_id)


async def confirm_cash_in(deps: Deps, user: User, order_id: UUID) -> OrderSnapshot:
    """The agent confirms the fiat arrived, which releases the customer's USDC from escrow."""

    async def start_release(conn: asyncpg.Connection, order: Order, role: Role, now: datetime) -> None:
        if order.status == "fiat_sent":  # already "releasing" means a retry; the payout below picks it up
            await order_repo.record_transition(conn, order, "releasing", actor="agent", meta={"note": "Agent confirmed the payment arrived."})

    await _act(deps, user, order_id, Action.CONFIRM, start_release, order_type="cash_in")
    return await _settle_for(deps, user, order_id, PayoutKind.RELEASE)


# ─── Cash out (cash_out) ────────────────────────────────────────────────────────


async def open_cash_out(
    deps: Deps,
    user: User,
    *,
    agent_id: UUID,
    payout: dict[str, Any] | None,
    fiat_amount: Decimal | None = None,
    usdc_amount: Decimal | None = None,
) -> OrderSnapshot:
    """The customer asks an agent for fiat and is told where to send USDC."""
    agent = await _agent_for(deps, user, agent_id)
    payout_details = validate_details(agent.rail, payout, "payout")
    return await _open(deps, user, "cash_out", agent_id, fiat_amount, usdc_amount, payout_details=payout_details)


async def attach_cash_out_payment(deps: Deps, user: User, order_id: UUID, tx_hash: str) -> OrderSnapshot:
    """The customer sent USDC to escrow. It's locked to the order once Stellar shows the payment matches."""
    tx_hash = tx_hash.strip().lower()
    now = deps.clock()
    async with transaction(deps.pool) as conn:
        order, _, role = await _load(conn, order_id, user)
    lifecycle.require_type(order, "cash_out")
    lifecycle.rule_for(order, Action.USDC_SENT, role)
    if order.funding_tx == tx_hash:
        return await get(deps, user, order_id)
    if order.funding_tx is None:
        lifecycle.check(order, Action.USDC_SENT, role, now, deps.policy)

    tx = await stellar.fetch_transaction(deps.stellar, tx_hash)  # no lock held while Stellar answers
    funding = verify_cash_out_funding(order, tx, escrow=stellar.escrow_address(deps.stellar), usdc=deps.stellar.usdc)

    async with transaction(deps.pool) as conn:
        order, _, role = await _load(conn, order_id, user, for_update=True)
        if attach_decision(order, funding.hash) == "attach":
            lifecycle.check(order, Action.USDC_SENT, role, now, deps.policy)
            try:
                await order_repo.record_transition(
                    conn,
                    order,
                    "usdc_locked",
                    actor="user",
                    meta={"hash": funding.hash, "ledger": funding.ledger},
                    funding_tx=funding.hash,
                    locked_at=now,
                )
            except DuplicateFundingTx as exc:
                raise AppError(ErrorKind.CONFLICT, "TX_ALREADY_USED", "This payment is already attached to another order.") from exc
    return await get(deps, user, order_id)


async def mark_cash_out_paid(deps: Deps, user: User, order_id: UUID, *, reference: str | None) -> OrderSnapshot:
    """The agent says they paid the customer's account, quoting the payout reference."""

    async def mark(conn: asyncpg.Connection, order: Order, role: Role, now: datetime) -> None:
        if not reference:
            raise AppError(ErrorKind.INVALID, "REFERENCE_REQUIRED", "Add the bank or mobile-money reference of your payout.")
        await order_repo.record_transition(conn, order, "fiat_sent", actor="agent", meta={"reference": reference}, agent_reference=reference, fiat_sent_at=now)

    await _act(deps, user, order_id, Action.FIAT_SENT, mark, order_type="cash_out")
    return await get(deps, user, order_id)


async def confirm_cash_out(deps: Deps, user: User, order_id: UUID) -> OrderSnapshot:
    """The customer confirms the agent's payout arrived."""

    async def complete(conn: asyncpg.Connection, order: Order, role: Role, now: datetime) -> None:
        await _complete_cash_out(conn, order, now, actor="user", note="Customer confirmed the payout arrived.")

    await _act(deps, user, order_id, Action.CONFIRM, complete, order_type="cash_out")
    return await get(deps, user, order_id)


async def refund_cash_out(deps: Deps, user: User, order_id: UUID) -> OrderSnapshot:
    """After the payout window, the customer takes back USDC the agent never paid for."""

    async def start_refund(conn: asyncpg.Connection, order: Order, role: Role, now: datetime) -> None:
        if order.status == "usdc_locked":  # already "refunding" means a retry
            note = "Agent missed the payout window. Customer asked for a refund."
            await order_repo.record_transition(conn, order, "refunding", actor="user", meta={"note": note})

    await _act(deps, user, order_id, Action.REFUND, start_refund, order_type="cash_out")
    return await _settle_for(deps, user, order_id, PayoutKind.REFUND)


# ─── Either kind ────────────────────────────────────────────────────────────────


async def mark_fiat_sent(deps: Deps, user: User, order_id: UUID, *, reference: str | None = None) -> OrderSnapshot:
    """`fiat-sent`: the customer paid the agent (add money), or the agent paid out (cash out)."""
    if await _type_of(deps, order_id) == "cash_in":
        return await mark_cash_in_paid(deps, user, order_id)
    return await mark_cash_out_paid(deps, user, order_id, reference=reference)


async def confirm(deps: Deps, user: User, order_id: UUID) -> OrderSnapshot:
    """`confirm`: the agent received the fiat (add money), or the customer did (cash out)."""
    if await _type_of(deps, order_id) == "cash_in":
        return await confirm_cash_in(deps, user, order_id)
    return await confirm_cash_out(deps, user, order_id)


async def dispute(deps: Deps, user: User, order_id: UUID, *, reason: str) -> OrderSnapshot:
    """Either side flags fiat that didn't arrive. Funds stay exactly where they are."""

    async def open_dispute(conn: asyncpg.Connection, order: Order, role: Role, now: datetime) -> None:
        await order_repo.record_transition(conn, order, "disputed", actor=role, meta={"reason": reason}, dispute_reason=reason)

    await _act(deps, user, order_id, Action.DISPUTE, open_dispute)
    return await get(deps, user, order_id)


# ─── Reading ────────────────────────────────────────────────────────────────────


async def get(deps: Deps, user: User, order_id: UUID) -> OrderSnapshot:
    async with transaction(deps.pool) as conn:
        order, agent, role = await _load(conn, order_id, user)
        events = await order_repo.events(conn, order.id)
    return _snapshot(deps, order, agent, role, events)


async def list_as_customer(deps: Deps, user: User, *, open_only: bool) -> list[OrderSnapshot]:
    async with transaction(deps.pool) as conn:
        orders = await order_repo.list_for_user(conn, user.id, open_only=open_only)
        agents = await agent_repo.get_many(conn, list({o.agent_id for o in orders}))
    return [_snapshot(deps, o, agents[o.agent_id], "user") for o in orders]


async def list_as_agent(deps: Deps, user: User, *, open_only: bool) -> list[OrderSnapshot]:
    async with transaction(deps.pool) as conn:
        agent = await agent_repo.get_by_user(conn, user.id)
        if agent is None:
            raise AppError(ErrorKind.FORBIDDEN, "NOT_AN_AGENT", "This account isn't registered as an agent.")
        orders = await order_repo.list_for_agent(conn, agent.id, open_only=open_only)
    return [_snapshot(deps, o, agent, "agent") for o in orders]


# ─── Time-driven: called by services.maintenance ────────────────────────────────


async def expire(deps: Deps, order_id: UUID) -> None:
    """Closes an order nobody acted on in time. An add-money order frees the agent's promised float."""
    now = deps.clock()
    async with transaction(deps.pool) as conn:
        order = await order_repo.get(conn, order_id, for_update=True)
        if order is None or not lifecycle.is_due_to_expire(order, now):
            return
        if order.type == "cash_in":
            note = "Payment window closed. The agent's USDC is available again."
            if await order_repo.record_transition(conn, order, "expired", actor="system", meta={"note": note}):
                await agent_repo.release_reservation(conn, order.agent_id, order.usdc_amount)
        else:
            note = "No USDC arrived in time. USDC sent later is still credited."
            await order_repo.record_transition(conn, order, "expired", actor="system", meta={"note": note})


async def auto_complete(deps: Deps, order_id: UUID) -> None:
    """Completes a paid-out cash-out that the customer neither confirmed nor disputed in time."""
    now = deps.clock()
    async with transaction(deps.pool) as conn:
        order = await order_repo.get(conn, order_id, for_update=True)
        if order is not None and lifecycle.is_due_to_auto_complete(order, now, deps.policy):
            await _complete_cash_out(conn, order, now, actor="system", note="No dispute within the confirmation window.")


async def settle_payout(deps: Deps, order_id: UUID, kind: PayoutKind | None = None) -> PayoutResult:
    """Drives an order's escrow payment, and records what it means once it lands."""
    if kind is None:
        async with transaction(deps.pool) as conn:
            order = await order_repo.get(conn, order_id)
        kind = next((k for k, status in SETTLING.items() if order is not None and order.status == status), None)
        if kind is None:
            return PayoutResult("not_settling")

    result = await pay_out(deps, order_id, kind)
    if result.outcome == "settled" and result.tx_hash:
        async with transaction(deps.pool) as conn:
            order = await order_repo.get(conn, order_id, for_update=True)
            if should_record_settled(order, kind, result.tx_hash):
                assert order is not None
                meta = {"hash": result.tx_hash, "ledger": result.ledger}
                await order_repo.record_transition(conn, order, SETTLED[kind], actor="system", meta=meta, completed_at=deps.clock())
                if kind is PayoutKind.RELEASE:
                    # The promised USDC left escrow for the customer, so it leaves the float too.
                    await agent_repo.consume_reservation(conn, order.agent_id, order.usdc_amount)
    return result


# ─── Internals ──────────────────────────────────────────────────────────────────


async def _open(
    deps: Deps,
    user: User,
    order_type: OrderType,
    agent_id: UUID,
    fiat_amount: Decimal | None,
    usdc_amount: Decimal | None,
    *,
    payout_details: dict[str, Any] | None,
) -> OrderSnapshot:
    now = deps.clock()
    cash_in = order_type == "cash_in"
    for _ in range(3):
        try:
            async with transaction(deps.pool) as conn:
                # Locking the agent serializes every change to their float.
                agent = await agent_repo.get(conn, agent_id, for_update=True)
                if agent is None or not agent.active:
                    raise _agent_unavailable()
                price = quote(order_type, agent, fiat_amount=fiat_amount, usdc_amount=usdc_amount)
                if cash_in:
                    ensure_can_reserve(agent, price.usdc)
                    await agent_repo.reserve(conn, agent.id, price.usdc)
                order = await order_repo.insert(
                    conn,
                    NewOrder(
                        ref=_new_ref(),
                        type=order_type,
                        status="awaiting_fiat" if cash_in else "awaiting_usdc",
                        user=user,
                        agent=agent,
                        fiat_amount=price.fiat,
                        usdc_amount=price.usdc,
                        rate=price.rate,
                        pay_details=agent.pay_details if cash_in else None,
                        payout_details=payout_details,
                        expires_at=now + (deps.cash_in_ttl if cash_in else deps.cash_out_ttl),
                    ),
                    meta={"fiatAmount": fmt_fiat(price.fiat), "usdcAmount": fmt_usdc(price.usdc), "rate": fmt_rate(price.rate)},
                )
        except DuplicateRef:
            continue
        return await get(deps, user, order.id)
    raise AppError(ErrorKind.UNAVAILABLE, "REF_COLLISION", "Couldn't allocate an order reference. Try again.")


async def _agent_for(deps: Deps, user: User, agent_id: UUID) -> Agent:
    async with transaction(deps.pool) as conn:
        agent = await agent_repo.get(conn, agent_id)
    if agent is None or not agent.active:
        raise _agent_unavailable()
    if agent.user_id == user.id:
        raise AppError(ErrorKind.UNPROCESSABLE, "SELF_TRADE", "Agents can't place orders at their own desk.")
    return agent


async def _act(deps: Deps, user: User, order_id: UUID, action: Action, apply: Apply, *, order_type: OrderType | None = None) -> None:
    """Locks the order, checks the action against the lifecycle rules, and applies it only if there's work to do."""
    now = deps.clock()
    async with transaction(deps.pool) as conn:
        order, _, role = await _load(conn, order_id, user, for_update=True)
        if order_type is not None:
            lifecycle.require_type(order, order_type)
        if lifecycle.check(order, action, role, now, deps.policy) is Decision.PROCEED:
            await apply(conn, order, role, now)


async def _settle_for(deps: Deps, user: User, order_id: UUID, kind: PayoutKind) -> OrderSnapshot:
    result = await settle_payout(deps, order_id, kind)
    return replace(await get(deps, user, order_id), pending=result.outcome == "pending")


async def _complete_cash_out(conn: asyncpg.Connection, order: Order, now: datetime, *, actor: Actor, note: str) -> None:
    if await order_repo.record_transition(conn, order, "completed", actor=actor, meta={"note": note}, completed_at=now):
        # The agent paid fiat for the customer's USDC, which now belongs to their float.
        await agent_repo.credit(conn, order.agent_id, order.usdc_amount)


async def _type_of(deps: Deps, order_id: UUID) -> OrderType:
    async with transaction(deps.pool) as conn:
        order = await order_repo.get(conn, order_id)
    if order is None:
        raise order_not_found()
    return order.type


async def _load(conn: asyncpg.Connection, order_id: UUID, user: User, *, for_update: bool = False) -> tuple[Order, Agent, Role]:
    order = await order_repo.get(conn, order_id, for_update=for_update)
    if order is None:
        raise order_not_found()
    agent = await agent_repo.get(conn, order.agent_id)
    if agent is None:
        raise order_not_found()
    return order, agent, lifecycle.role_of(order, user, agent)


def _snapshot(deps: Deps, order: Order, agent: Agent, role: Role, events: list[OrderEvent] | None = None) -> OrderSnapshot:
    return OrderSnapshot(
        order=order,
        agent=agent,
        role=role,
        actions=lifecycle.allowed_actions(order, role, deps.clock(), deps.policy),
        refund_available_at=lifecycle.refund_available_at(order, deps.policy),
        events=events,
    )


def _new_ref() -> str:
    return "PU-" + "".join(secrets.choice(REF_ALPHABET) for _ in range(6))


def _agent_unavailable() -> AppError:
    return AppError(ErrorKind.NOT_FOUND, "AGENT_NOT_FOUND", "That agent isn't available.")
