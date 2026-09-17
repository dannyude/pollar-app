"""Decisions behind paying USDC out of escrow exactly once.

Stellar I/O lives in the gateway and database I/O in the payout service; this
module only decides, from facts, what happened to a signed payment and what to do
next. That's what keeps an order from being paid twice, so it's tested on its own.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Literal

from .lifecycle import SETTLING
from .models import EscrowEnvelope, Order, PayoutKind

# Wait this long past a payment's time bound before calling it dead, so a slow
# Horizon node can't make a payment that did land look like one that didn't.
EXPIRY_GRACE = timedelta(seconds=120)


@dataclass(frozen=True)
class SourceTx:
    """One transaction the escrow account itself sent, as Horizon lists it."""

    sequence: int
    hash: str
    successful: bool
    ledger: int


@dataclass(frozen=True)
class EnvelopeState:
    # confirmed: landed and succeeded · failed: landed but failed (safe to sign a new one)
    # dead: can never land (safe to sign a new one) · pending: might still land (resubmit it, never re-sign)
    kind: Literal["confirmed", "failed", "dead", "pending"]
    ledger: int | None = None


@dataclass(frozen=True)
class PayoutStep:
    kind: Literal["not_settling", "settled", "resubmit", "sign_new"]
    ledger: int | None = None
    replaces: EnvelopeState | None = None  # sign_new: the state of the envelope being replaced, if any


@dataclass(frozen=True)
class SubmitOutcome:
    kind: Literal["confirmed", "rejected", "unknown"]
    ledger: int | None = None
    bad_seq: bool = False
    codes: dict[str, Any] = field(default_factory=dict)


def envelope_of(order: Order, kind: PayoutKind) -> EscrowEnvelope | None:
    return order.release if kind is PayoutKind.RELEASE else order.refund


def envelope_to_check(order: Order | None, kind: PayoutKind) -> EscrowEnvelope | None:
    """The saved payment whose fate must be looked up before deciding, if any."""
    if order is None or order.status != SETTLING[kind]:
        return None
    return envelope_of(order, kind)


def judge_envelope(envelope: EscrowEnvelope, sequence: int, history: Sequence[SourceTx], now: datetime) -> EnvelopeState:
    """What became of a signed payment, from the escrow's own transactions (newest first).

    Whichever transaction used the payment's sequence number is either this payment
    (it landed) or another one (this one can never land). One ordered listing is
    enough: it doesn't rely on two Horizon nodes agreeing with each other."""
    for tx in history:
        if tx.sequence == sequence:
            if tx.hash != envelope.hash:
                return EnvelopeState("dead")
            return EnvelopeState("confirmed", tx.ledger) if tx.successful else EnvelopeState("failed")
        if tx.sequence < sequence:
            break
    if history and history[0].sequence > sequence:
        return EnvelopeState("dead")  # the account's sequence moved past ours without it
    if now > envelope.max_time + EXPIRY_GRACE:
        return EnvelopeState("dead")
    return EnvelopeState("pending")


def next_payout_step(order: Order | None, kind: PayoutKind, state: EnvelopeState | None) -> PayoutStep:
    """Given the order and the fate of its saved payment, what the payout should do now."""
    if order is None or order.status != SETTLING[kind]:
        return PayoutStep("not_settling")
    if envelope_of(order, kind) is None:
        return PayoutStep("sign_new")
    if state is None:
        raise ValueError("A saved payment must be judged before deciding the next step.")
    if state.kind == "confirmed":
        return PayoutStep("settled", ledger=state.ledger)
    if state.kind == "pending":
        return PayoutStep("resubmit")
    return PayoutStep("sign_new", replaces=state)


def classify_submit_failure(status: int | None, extras: dict[str, Any] | None) -> SubmitOutcome:
    """A 400 with result codes means Stellar rejected the payment; anything else
    (timeouts, 5xx, network errors) means it may still land."""
    codes = (extras or {}).get("result_codes") or {}
    if status == 400 and codes:
        return SubmitOutcome("rejected", bad_seq=codes.get("transaction") == "tx_bad_seq", codes=codes)
    return SubmitOutcome("unknown")


def should_record_settled(order: Order | None, kind: PayoutKind, tx_hash: str) -> bool:
    """Record the payout as done only if the order is still waiting on this exact payment."""
    if order is None or order.status != SETTLING[kind]:
        return False
    envelope = envelope_of(order, kind)
    return envelope is not None and envelope.hash == tx_hash
