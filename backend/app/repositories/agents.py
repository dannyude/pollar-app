"""Persistence for agent desks and their USDC float.

Each float function is one business event; whether it's allowed is decided in
`domain.floats` first. The database still rejects a reservation larger than the float."""

from decimal import Decimal
from uuid import UUID

import asyncpg

from ..domain.models import Agent, AgentRegistration


async def get(conn: asyncpg.Connection, agent_id: UUID, *, for_update: bool = False) -> Agent | None:
    row = await conn.fetchrow("select * from agents where id = $1" + (" for update" if for_update else ""), agent_id)
    return _agent(row) if row else None


async def get_many(conn: asyncpg.Connection, agent_ids: list[UUID]) -> dict[UUID, Agent]:
    rows = await conn.fetch("select * from agents where id = any($1::uuid[])", agent_ids)
    return {r["id"]: _agent(r) for r in rows}


async def get_by_user(conn: asyncpg.Connection, user_id: str) -> Agent | None:
    row = await conn.fetchrow("select * from agents where user_id = $1", user_id)
    return _agent(row) if row else None


async def list_active(conn: asyncpg.Connection, country: str | None) -> list[Agent]:
    rows = await conn.fetch(
        "select * from agents where active and ($1::text is null or country = upper($1)) order by rate_sell, display_name", country
    )
    return [_agent(r) for r in rows]


async def reserve(conn: asyncpg.Connection, agent_id: UUID, usdc: Decimal) -> None:
    """Promises part of the float to an add-money order."""
    await _shift(conn, agent_id, float_by=Decimal(0), reserved_by=usdc)


async def release_reservation(conn: asyncpg.Connection, agent_id: UUID, usdc: Decimal) -> None:
    """The add-money order ended unpaid: the promised USDC is free again."""
    await _shift(conn, agent_id, float_by=Decimal(0), reserved_by=-usdc)


async def consume_reservation(conn: asyncpg.Connection, agent_id: UUID, usdc: Decimal) -> None:
    """The promised USDC left escrow for the customer: it leaves the float too."""
    await _shift(conn, agent_id, float_by=-usdc, reserved_by=-usdc)


async def credit(conn: asyncpg.Connection, agent_id: UUID, usdc: Decimal) -> None:
    """The agent paid fiat for a customer's USDC, which now belongs to their float."""
    await _shift(conn, agent_id, float_by=usdc, reserved_by=Decimal(0))


async def upsert(conn: asyncpg.Connection, registration: AgentRegistration) -> Agent:
    r = registration
    row = await conn.fetchrow(
        """insert into agents (user_id, display_name, country, currency, rail, pay_details,
                               rate_buy, rate_sell, min_fiat, max_fiat, active)
           values ($1, $2, upper($3), upper($4), $5, $6, $7, $8, $9, $10, $11)
           on conflict (user_id) do update set
             display_name = excluded.display_name, country = excluded.country, currency = excluded.currency,
             rail = excluded.rail, pay_details = excluded.pay_details, rate_buy = excluded.rate_buy,
             rate_sell = excluded.rate_sell, min_fiat = excluded.min_fiat, max_fiat = excluded.max_fiat,
             active = excluded.active, updated_at = now()
           returning *""",
        r.user_id, r.display_name, r.country, r.currency, r.rail, r.pay_details,
        r.rate_buy, r.rate_sell, r.min_fiat, r.max_fiat, r.active,
    )
    return _agent(row)


async def set_float(conn: asyncpg.Connection, agent_id: UUID, usdc: Decimal) -> Agent:
    row = await conn.fetchrow("update agents set float_usdc = $1, updated_at = now() where id = $2 returning *", usdc, agent_id)
    return _agent(row)


async def _shift(conn: asyncpg.Connection, agent_id: UUID, *, float_by: Decimal, reserved_by: Decimal) -> None:
    await conn.execute(
        """update agents
           set float_usdc = float_usdc + $2, reserved_usdc = reserved_usdc + $3, updated_at = now()
           where id = $1""",
        agent_id,
        float_by,
        reserved_by,
    )


def _agent(row: asyncpg.Record) -> Agent:
    return Agent(
        id=row["id"],
        user_id=row["user_id"],
        display_name=row["display_name"],
        country=row["country"],
        currency=row["currency"],
        rail=row["rail"],
        pay_details=row["pay_details"],
        rate_buy=row["rate_buy"],
        rate_sell=row["rate_sell"],
        min_fiat=row["min_fiat"],
        max_fiat=row["max_fiat"],
        float_usdc=row["float_usdc"],
        reserved_usdc=row["reserved_usdc"],
        active=row["active"],
    )
