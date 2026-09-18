"""Getting a wallet ready to hold USDC.

Pollar creates the wallet, but on testnet its provisioning can fail and leave an
address with no account behind it — and nothing can be sent to an account that
doesn't exist. This repairs that, so a new user isn't stuck at the first screen.
"""

import asyncio
from dataclasses import dataclass

from ..deps import Deps
from ..domain.errors import AppError, ErrorKind
from ..domain.models import User
from ..gateways import stellar


@dataclass(frozen=True)
class Activation:
    address: str
    #: True when this call created the account, False when it already existed.
    funded: bool
    can_hold_usdc: bool


async def activate(deps: Deps, user: User) -> Activation:
    """Creates the caller's own wallet on testnet if Stellar has never seen it."""
    if deps.stellar.network != "testnet":
        raise AppError(
            ErrorKind.FORBIDDEN,
            "TESTNET_ONLY",
            "Wallets are funded by their owner on mainnet; this only works on testnet.",
        )

    account = await stellar.fetch_account(deps.stellar, user.wallet)
    if account is not None:
        return Activation(address=user.wallet, funded=False, can_hold_usdc=account.usdc_balance is not None)

    await stellar.fund_testnet_account(deps.stellar, user.wallet)
    # Friendbot answers before the ledger closes; give it a moment to appear.
    for _ in range(10):
        await asyncio.sleep(1)
        account = await stellar.fetch_account(deps.stellar, user.wallet)
        if account is not None:
            return Activation(address=user.wallet, funded=True, can_hold_usdc=account.usdc_balance is not None)

    raise AppError(
        ErrorKind.UNAVAILABLE,
        "WALLET_NOT_READY_YET",
        "The wallet was funded but hasn't appeared on Stellar yet. Try again in a few seconds.",
    )
