"""Rules for USDC moving in and out of wallets, judged from facts Stellar reports.

The Stellar gateway fetches the facts; these functions decide what they mean.
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from .errors import AppError, ErrorKind
from .models import Order
from .money import fmt_usdc


@dataclass(frozen=True)
class Asset:
    code: str
    issuer: str


@dataclass(frozen=True)
class AccountFacts:
    address: str
    usdc_balance: Decimal | None  # None: the account has no USDC trustline


@dataclass(frozen=True)
class PaymentFacts:
    source: str
    destination: str
    asset: Asset | None  # None: native XLM
    amount: Decimal


@dataclass(frozen=True)
class TransactionFacts:
    hash: str  # canonical: the outer hash for a fee-bumped transaction
    successful: bool
    memo_type: str | None
    memo: str | None
    ledger: int
    payments: list[PaymentFacts]


@dataclass(frozen=True)
class VerifiedFunding:
    hash: str
    ledger: int


def ensure_can_hold_usdc(account: AccountFacts | None) -> None:
    """USDC can only be sent to an existing account with a USDC trustline."""
    if account is None:
        raise AppError(ErrorKind.CONFLICT, "WALLET_NOT_ACTIVATED", "This wallet isn't active on Stellar yet, so it can't receive USDC.")
    if account.usdc_balance is None:
        raise AppError(
            ErrorKind.CONFLICT,
            "WALLET_NO_USDC_TRUSTLINE",
            "This wallet can't hold USDC yet. Add USDC under Pollar dashboard → Tokens & Trustlines, or call setTrustline in the app.",
        )


def ensure_escrow_covers(balance: Decimal | None, amount: Decimal) -> None:
    if (balance or Decimal(0)) < amount:
        raise AppError(ErrorKind.UNAVAILABLE, "ESCROW_UNDERFUNDED", "The escrow doesn't hold enough USDC for this payment.")


def verify_cash_out_funding(order: Order, tx: TransactionFacts | None, *, escrow: str, usdc: Asset) -> VerifiedFunding:
    """A cash-out is funded only by a successful transaction whose text memo is the
    order ref and which pays exactly the order's USDC from the customer's wallet to
    escrow. The payment operation is what's checked, not the fee payer: Pollar
    fee-bumps its users' transactions."""
    if tx is None:
        raise AppError(ErrorKind.NOT_FOUND, "TX_NOT_FOUND", "Stellar doesn't show this transaction yet. Wait a few seconds and try again.")
    if not tx.successful:
        raise AppError(ErrorKind.UNPROCESSABLE, "TX_FAILED", "This transaction failed on Stellar, so no USDC moved.")
    if tx.memo_type != "text" or tx.memo != order.ref:
        raise AppError(ErrorKind.UNPROCESSABLE, "TX_MEMO_MISMATCH", f"The payment memo must be {order.ref}.", {"memo": tx.memo})

    payment = next(
        (p for p in tx.payments if p.destination == escrow and p.source == order.user_wallet and p.asset == usdc),
        None,
    )
    if payment is None:
        raise AppError(
            ErrorKind.UNPROCESSABLE,
            "TX_NOT_ESCROW_PAYMENT",
            "This transaction isn't a USDC payment from your wallet to the escrow.",
            {"escrow": escrow, "expectedFrom": order.user_wallet},
        )
    if payment.amount != order.usdc_amount:
        raise AppError(
            ErrorKind.UNPROCESSABLE,
            "TX_AMOUNT_MISMATCH",
            f"The payment must be exactly {fmt_usdc(order.usdc_amount)} USDC.",
            {"paid": fmt_usdc(payment.amount)},
        )
    return VerifiedFunding(hash=tx.hash, ledger=tx.ledger)


def attach_decision(order: Order, verified_hash: str) -> Literal["already_attached", "attach"]:
    """What a verified payment means for a cash-out: nothing new, or lock it to the order.
    The same payment may arrive under its inner hash; the verified hash is canonical."""
    if order.funding_tx == verified_hash:
        return "already_attached"
    if order.funding_tx is not None:
        raise AppError(ErrorKind.CONFLICT, "ALREADY_FUNDED", "This order already has a different payment attached.")
    return "attach"
