"""Letting time pass for orders: expiries, auto-completion, and escrow payments still
settling. This module only decides what is due; `services.orders` decides what that
means for each order, so a request and a timer can never disagree."""

import asyncio
import logging
from datetime import timedelta

from ..deps import Deps
from ..domain.errors import AppError
from ..repositories import orders as order_repo
from ..repositories.db import transaction
from . import orders

log = logging.getLogger("puente.maintenance")

SETTLE_RETRY_AFTER = timedelta(seconds=15)


async def run_once(deps: Deps) -> None:
    now = deps.clock()
    async with transaction(deps.pool) as conn:
        expiring = await order_repo.due_to_expire(conn, now)
        completing = await order_repo.due_to_auto_complete(conn, now - deps.policy.auto_complete_after)
        settling = await order_repo.settling_since(conn, now - SETTLE_RETRY_AFTER)

    for order_id in expiring:
        await orders.expire(deps, order_id)
    for order_id in completing:
        await orders.auto_complete(deps, order_id)
    for order_id in settling:
        try:
            await orders.settle_payout(deps, order_id)
        except AppError as exc:
            log.warning("payout for %s still failing: %s", order_id, exc.code)


async def run_forever(deps: Deps) -> None:
    while True:
        try:
            await run_once(deps)
        except Exception:
            log.exception("maintenance pass failed")
        await asyncio.sleep(deps.maintenance_interval_seconds)
