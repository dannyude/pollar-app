"""Public evidence that Puente is used, and that the escrow covers what it owes."""

import time
from dataclasses import dataclass
from decimal import Decimal

from ..deps import Deps
from ..domain.errors import AppError
from ..domain.models import Order, UsageTotals
from ..gateways import stellar
from ..repositories import stats as stats_repo
from ..repositories.db import transaction

BALANCE_CACHE_SECONDS = 30


@dataclass(frozen=True)
class ProofSnapshot:
    escrow_address: str
    escrow_usdc: Decimal | None  # None when Stellar couldn't be reached
    totals: UsageTotals
    recent: list[Order]


async def snapshot(deps: Deps) -> ProofSnapshot:
    async with transaction(deps.pool) as conn:
        totals = await stats_repo.totals(conn)
        recent = await stats_repo.recently_settled(conn)
    return ProofSnapshot(
        escrow_address=stellar.escrow_address(deps.stellar),
        escrow_usdc=await _escrow_usdc(deps),
        totals=totals,
        recent=recent,
    )


async def _escrow_usdc(deps: Deps) -> Decimal | None:
    now = time.time()
    cached = deps.escrow_balance_cache.get("escrow", now)
    if cached is not None:
        return cached.value
    try:
        account = await stellar.fetch_account(deps.stellar, stellar.escrow_address(deps.stellar))
    except AppError:
        return None
    balance = account.usdc_balance if account else None
    deps.escrow_balance_cache.put("escrow", balance, until=now + BALANCE_CACHE_SECONDS)
    return balance
