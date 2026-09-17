"""The decisions that keep an order from being paid twice."""

from dataclasses import replace
from datetime import timedelta

import pytest

from app.domain.models import PayoutKind
from app.domain.payouts import (
    EXPIRY_GRACE,
    EnvelopeState,
    SourceTx,
    classify_submit_failure,
    envelope_to_check,
    judge_envelope,
    next_payout_step,
    should_record_settled,
)

from .factories import NOW, make_envelope, make_order

ENVELOPE = make_envelope()
SEQUENCE = 1001


def sent(sequence, tx_hash, successful=True, ledger=500):
    return SourceTx(sequence=sequence, hash=tx_hash, successful=successful, ledger=ledger)


# ─── What became of a signed payment ────────────────────────────────────────────


def test_our_payment_used_the_sequence_and_succeeded():
    history = [sent(1003, "x"), sent(1001, ENVELOPE.hash, ledger=77), sent(1000, "y")]
    assert judge_envelope(ENVELOPE, SEQUENCE, history, NOW) == EnvelopeState("confirmed", 77)


def test_our_payment_used_the_sequence_but_failed():
    assert judge_envelope(ENVELOPE, SEQUENCE, [sent(1001, ENVELOPE.hash, successful=False)], NOW) == EnvelopeState("failed")


def test_another_payment_used_our_sequence_so_ours_can_never_land():
    assert judge_envelope(ENVELOPE, SEQUENCE, [sent(1002, "z"), sent(1001, "other")], NOW) == EnvelopeState("dead")


def test_the_sequence_moved_past_ours_without_it():
    assert judge_envelope(ENVELOPE, SEQUENCE, [sent(1005, "z"), sent(999, "w")], NOW) == EnvelopeState("dead")


def test_an_unused_sequence_with_time_left_is_still_pending():
    assert judge_envelope(ENVELOPE, SEQUENCE, [sent(1000, "y")], NOW) == EnvelopeState("pending")
    assert judge_envelope(ENVELOPE, SEQUENCE, [], NOW) == EnvelopeState("pending")


def test_expiry_counts_only_after_the_grace_period():
    just_expired = ENVELOPE.max_time + timedelta(seconds=60)
    long_expired = ENVELOPE.max_time + EXPIRY_GRACE + timedelta(seconds=1)
    assert judge_envelope(ENVELOPE, SEQUENCE, [sent(1000, "y")], just_expired) == EnvelopeState("pending")
    assert judge_envelope(ENVELOPE, SEQUENCE, [sent(1000, "y")], long_expired) == EnvelopeState("dead")


# ─── What to do next ────────────────────────────────────────────────────────────

RELEASING = make_order(status="releasing", release=ENVELOPE)


def test_nothing_to_do_unless_the_order_is_settling():
    assert next_payout_step(None, PayoutKind.RELEASE, None).kind == "not_settling"
    assert next_payout_step(replace(RELEASING, status="completed"), PayoutKind.RELEASE, None).kind == "not_settling"


def test_sign_a_payment_when_none_is_saved():
    assert next_payout_step(replace(RELEASING, release=None), PayoutKind.RELEASE, None).kind == "sign_new"


def test_a_saved_payment_must_be_judged_first():
    with pytest.raises(ValueError):
        next_payout_step(RELEASING, PayoutKind.RELEASE, None)


@pytest.mark.parametrize(
    ("state", "kind", "replaces"),
    [
        (EnvelopeState("confirmed", 77), "settled", None),
        (EnvelopeState("pending"), "resubmit", None),
        (EnvelopeState("failed"), "sign_new", EnvelopeState("failed")),
        (EnvelopeState("dead"), "sign_new", EnvelopeState("dead")),
    ],
)
def test_the_saved_payments_fate_decides_the_step(state, kind, replaces):
    step = next_payout_step(RELEASING, PayoutKind.RELEASE, state)
    assert (step.kind, step.replaces) == (kind, replaces)


def test_a_confirmed_payment_carries_its_ledger():
    assert next_payout_step(RELEASING, PayoutKind.RELEASE, EnvelopeState("confirmed", 77)).ledger == 77


def test_refunds_use_the_refund_slot_not_the_release_slot():
    refunding = make_order(type="cash_out", status="refunding", refund=ENVELOPE, release=make_envelope(hash="f" * 64))
    assert envelope_to_check(refunding, PayoutKind.REFUND) == ENVELOPE
    assert envelope_to_check(refunding, PayoutKind.RELEASE) is None  # not releasing


# ─── Reading Stellar's answer to a submission ───────────────────────────────────


@pytest.mark.parametrize(
    ("status", "extras", "kind", "bad_seq"),
    [
        (400, {"result_codes": {"transaction": "tx_bad_seq"}}, "rejected", True),
        (400, {"result_codes": {"transaction": "tx_failed", "operations": ["op_no_trust"]}}, "rejected", False),
        (400, {}, "unknown", False),
        (429, {"result_codes": {"transaction": "tx_failed"}}, "unknown", False),
        (504, None, "unknown", False),
        (None, None, "unknown", False),
    ],
)
def test_only_a_400_with_result_codes_counts_as_rejected(status, extras, kind, bad_seq):
    outcome = classify_submit_failure(status, extras)
    assert (outcome.kind, outcome.bad_seq) == (kind, bad_seq)


# ─── Recording the payout as done ───────────────────────────────────────────────


def test_settle_only_for_the_exact_payment_the_order_is_waiting_on():
    assert should_record_settled(RELEASING, PayoutKind.RELEASE, ENVELOPE.hash)
    assert not should_record_settled(RELEASING, PayoutKind.RELEASE, "f" * 64)
    assert not should_record_settled(replace(RELEASING, status="completed"), PayoutKind.RELEASE, ENVELOPE.hash)
    assert not should_record_settled(RELEASING, PayoutKind.REFUND, ENVELOPE.hash)
    assert not should_record_settled(None, PayoutKind.RELEASE, ENVELOPE.hash)
