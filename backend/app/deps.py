"""The dependencies services receive, passed explicitly as their first argument.
The one place that knows how to open (and close) them."""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import asyncpg

from .cache import TtlCache
from .config import Settings
from .domain.lifecycle import Policy
from .domain.models import User
from .gateways import pollar, stellar
from .repositories.db import close_pool, open_pool


def utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True)
class Deps:
    pool: asyncpg.Pool
    stellar: stellar.StellarClient
    pollar: pollar.PollarClient
    policy: Policy
    cash_in_ttl: timedelta
    cash_out_ttl: timedelta
    dev_auth: bool
    maintenance_interval_seconds: float
    token_cache: TtlCache[str, User] = field(default_factory=TtlCache)
    escrow_balance_cache: TtlCache[str, Decimal | None] = field(default_factory=TtlCache)
    clock: Callable[[], datetime] = utcnow


async def open_deps(settings: Settings) -> Deps:
    return Deps(
        pool=await open_pool(settings.database_url),
        stellar=stellar.open_client(
            horizon_url=settings.horizon,
            network=settings.stellar_network,
            usdc_issuer=settings.usdc_issuer_address,
            escrow_secret=settings.escrow_secret,
        ),
        pollar=pollar.open_client(api_url=settings.pollar_server_api_url, secret_key=settings.pollar_secret_key),
        policy=Policy(
            payout_window=timedelta(minutes=settings.payout_window_minutes),
            auto_complete_after=timedelta(hours=settings.auto_complete_hours),
        ),
        cash_in_ttl=timedelta(minutes=settings.cash_in_ttl_minutes),
        cash_out_ttl=timedelta(minutes=settings.cash_out_ttl_minutes),
        dev_auth=settings.dev_auth_enabled,
        maintenance_interval_seconds=settings.maintenance_interval_seconds,
    )


async def close_deps(deps: Deps) -> None:
    await pollar.close_client(deps.pollar)
    await stellar.close_client(deps.stellar)
    await close_pool(deps.pool)
