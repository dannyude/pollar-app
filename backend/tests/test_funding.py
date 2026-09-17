from dataclasses import replace
from decimal import Decimal

import pytest

from app.domain.funding import (
    AccountFacts,
    Asset,
    PaymentFacts,
    TransactionFacts,
    attach_decision,
    ensure_can_hold_usdc,
    ensure_escrow_covers,
    verify_cash_out_funding,
)

from .factories import CUSTOMER, ESCROW, STRANGER, USDC, address, error_of, make_order

ORDER = make_order(type="cash_out", status="awaiting_usdc", ref="PU-AAAA22", usdc_amount=Decimal("10.0000000"))
PAYMENT = PaymentFacts(source=CUSTOMER.wallet, destination=ESCROW, asset=USDC, amount=Decimal("10.0000000"))
TX = TransactionFacts(hash="b" * 64, successful=True, memo_type="text", memo="PU-AAAA22", ledger=120, payments=[PAYMENT])


def verify(tx):
    return verify_cash_out_funding(ORDER, tx, escrow=ESCROW, usdc=USDC)


def test_a_matching_payment_funds_the_order_under_its_canonical_hash():
    funding = verify(TX)
    assert (funding.hash, funding.ledger) == ("b" * 64, 120)


def test_the_right_payment_is_found_among_other_operations():
    others = [replace(PAYMENT, asset=None), replace(PAYMENT, destination=address(9))]
    assert verify(replace(TX, payments=[*others, PAYMENT])).hash == TX.hash


@pytest.mark.parametrize(
    ("tx", "code"),
    [
        (None, "TX_NOT_FOUND"),
        (replace(TX, successful=False), "TX_FAILED"),
        (replace(TX, memo=None, memo_type="none"), "TX_MEMO_MISMATCH"),
        (replace(TX, memo="PU-OTHER1"), "TX_MEMO_MISMATCH"),
        (replace(TX, memo_type="id"), "TX_MEMO_MISMATCH"),
        (replace(TX, payments=[replace(PAYMENT, source=STRANGER.wallet)]), "TX_NOT_ESCROW_PAYMENT"),
        (replace(TX, payments=[replace(PAYMENT, destination=address(9))]), "TX_NOT_ESCROW_PAYMENT"),
        (replace(TX, payments=[replace(PAYMENT, asset=Asset("USDC", address(9)))]), "TX_NOT_ESCROW_PAYMENT"),
        (replace(TX, payments=[replace(PAYMENT, asset=None)]), "TX_NOT_ESCROW_PAYMENT"),
        (replace(TX, payments=[replace(PAYMENT, amount=Decimal("9.9999999"))]), "TX_AMOUNT_MISMATCH"),
    ],
)
def test_anything_else_does_not_fund_it(tx, code):
    assert error_of(verify, tx).code == code


def test_a_short_payment_reports_what_was_paid():
    error = error_of(verify, replace(TX, payments=[replace(PAYMENT, amount=Decimal("9.5"))]))
    assert error.details == {"paid": "9.5000000"}


def test_attaching_the_same_payment_twice_is_a_no_op_and_a_different_one_is_refused():
    assert attach_decision(ORDER, "b" * 64) == "attach"
    funded = replace(ORDER, funding_tx="b" * 64)
    assert attach_decision(funded, "b" * 64) == "already_attached"
    assert error_of(attach_decision, funded, "c" * 64).code == "ALREADY_FUNDED"


def test_usdc_needs_an_active_wallet_with_a_trustline():
    assert error_of(ensure_can_hold_usdc, None).code == "WALLET_NOT_ACTIVATED"
    assert error_of(ensure_can_hold_usdc, AccountFacts(CUSTOMER.wallet, usdc_balance=None)).code == "WALLET_NO_USDC_TRUSTLINE"
    ensure_can_hold_usdc(AccountFacts(CUSTOMER.wallet, usdc_balance=Decimal("0")))


def test_the_escrow_must_hold_the_whole_payment():
    ensure_escrow_covers(Decimal("5"), Decimal("5"))
    assert error_of(ensure_escrow_covers, Decimal("4.9999999"), Decimal("5")).code == "ESCROW_UNDERFUNDED"
    assert error_of(ensure_escrow_covers, None, Decimal("5")).code == "ESCROW_UNDERFUNDED"
