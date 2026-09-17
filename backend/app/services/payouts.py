"""Paying an order's USDC out of escrow, exactly once.

Effects around pure decisions from `domain.payouts`. The signed payment is saved
under the order's row lock before it's submitted. A retry resubmits that same
payment, and a new one is signed only once the old one is proven unable to land.
What a settled payment means for the order is `services.orders`' business."""

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from ..deps import Deps
from ..domain.errors import AppError, ErrorKind
from ..domain.funding import ensure_can_hold_usdc, ensure_escrow_covers
from ..domain.models import EscrowEnvelope, Order, PayoutKind
from ..domain.payouts import EnvelopeState, envelope_to_check, judge_envelope, next_payout_step
from ..gateways import stellar
from ..repositories import orders as order_repo
from ..repositories.db import transaction


@dataclass(frozen=True)
class PayoutResult:
    outcome: Literal["settled", "pending", "not_settling"]
    tx_hash: str | None = None
    ledger: int | None = None


async def pay_out(deps: Deps, order_id: UUID, kind: PayoutKind) -> PayoutResult:
    for _ in range(3):
        async with transaction(deps.pool) as conn:
            order = await order_repo.get(conn, order_id, for_update=True)
            saved = envelope_to_check(order, kind)
            step = next_payout_step(order, kind, await _fate_of(deps, saved) if saved else None)

            if step.kind == "not_settling":
                return PayoutResult("not_settling")
            assert order is not None
            if step.kind == "settled":
                assert saved is not None
                return PayoutResult("settled", saved.hash, step.ledger)
            if step.kind == "resubmit":
                assert saved is not None
                envelope = saved
                await order_repo.touch(conn, order.id)
            else:
                if saved is not None and step.replaces is not None:
                    note = {"note": "Discarded an escrow payment that can't land.", "hash": saved.hash, "reason": step.replaces.kind}
                    await order_repo.record_note(conn, order, actor="system", meta=note)
                envelope = await _sign(deps, order)
                await order_repo.save_envelope(conn, order, kind, envelope)
                await order_repo.record_note(conn, order, actor="system", meta={"note": "Escrow payment signed.", "hash": envelope.hash})

        # Submit outside the transaction so the row lock isn't held while Stellar settles.
        outcome = await stellar.submit(deps.stellar, envelope)
        if outcome.kind == "confirmed":
            return PayoutResult("settled", envelope.hash, outcome.ledger)
        if outcome.kind == "unknown":
            return PayoutResult("pending")
        if not outcome.bad_seq:
            async with transaction(deps.pool) as conn:
                if (current := await order_repo.get(conn, order_id)) is not None:
                    note = {"note": "Stellar rejected the escrow payment.", "hash": envelope.hash, "codes": outcome.codes}
                    await order_repo.record_note(conn, current, actor="system", meta=note)
            raise AppError(
                ErrorKind.UPSTREAM,
                "ESCROW_PAYMENT_REJECTED",
                "Stellar rejected the escrow payment. Try again; if it keeps failing, check the escrow account.",
                outcome.codes,
            )
        # tx_bad_seq: another escrow payment took this sequence number. The next pass
        # sees that, discards this envelope and signs a fresh one.
    return PayoutResult("pending")


async def _fate_of(deps: Deps, envelope: EscrowEnvelope) -> EnvelopeState:
    source, sequence = stellar.envelope_origin(deps.stellar, envelope)
    history = await stellar.fetch_source_history(deps.stellar, source, sequence)
    return judge_envelope(envelope, sequence, history, deps.clock())


async def _sign(deps: Deps, order: Order) -> EscrowEnvelope:
    """Checks the payment can land, then signs it."""
    ensure_can_hold_usdc(await stellar.fetch_account(deps.stellar, order.user_wallet))
    escrow = await stellar.fetch_account(deps.stellar, stellar.escrow_address(deps.stellar))
    if escrow is None:
        raise AppError(ErrorKind.MISCONFIGURED, "ESCROW_ACCOUNT_MISSING", "The escrow account doesn't exist on Stellar. Run scripts/escrow_setup.py.")
    ensure_escrow_covers(escrow.usdc_balance, order.usdc_amount)
    return await stellar.sign_escrow_payment(deps.stellar, destination=order.user_wallet, amount=order.usdc_amount, memo=order.ref)
