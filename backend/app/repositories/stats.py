"""Read-only totals for the public proof page."""

import asyncpg

from ..domain.models import Order, UsageTotals
from .orders import to_order


async def totals(conn: asyncpg.Connection) -> UsageTotals:
    row = await conn.fetchrow(
        """select
             (select count(*) from users) as users,
             (select count(*) from agents where active) as agents,
             (select count(*) from orders where status = 'completed' and type = 'cash_in') as completed_cash_in,
             (select count(*) from orders where status = 'completed' and type = 'cash_out') as completed_cash_out,
             (select count(*) from orders where status = 'refunded') as refunded,
             (select coalesce(sum(usdc_amount), 0) from orders where status = 'completed') as volume_usdc,
             (select coalesce(sum(float_usdc), 0) from agents) as agent_float_usdc,
             (select coalesce(sum(usdc_amount), 0) from orders
                where type = 'cash_out' and funding_tx is not null
                  and status in ('usdc_locked', 'fiat_sent', 'refunding', 'disputed')) as locked_usdc"""
    )
    return UsageTotals(**dict(row))


async def recently_settled(conn: asyncpg.Connection, limit: int = 25) -> list[Order]:
    rows = await conn.fetch("select * from orders where status in ('completed', 'refunded') order by completed_at desc limit $1", limit)
    return [to_order(r) for r in rows]
