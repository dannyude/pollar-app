from dataclasses import replace
from datetime import timedelta

import pytest

from app.domain import lifecycle
from app.domain.lifecycle import Action, Decision

from .factories import AGENT_USER, CUSTOMER, NOW, POLICY, STRANGER, error_of, make_agent, make_order


def actions(order, role, now=NOW):
    return [a.value for a in lifecycle.allowed_actions(order, role, now, POLICY)]


def test_parties_get_their_role_and_strangers_cannot_see_the_order():
    order, agent = make_order(), make_agent()
    assert lifecycle.role_of(order, CUSTOMER, agent) == "user"
    assert lifecycle.role_of(order, AGENT_USER, agent) == "agent"
    assert error_of(lifecycle.role_of, order, STRANGER, agent).code == "ORDER_NOT_FOUND"


@pytest.mark.parametrize(
    ("order_type", "status", "role", "expected"),
    [
        ("cash_in", "awaiting_fiat", "user", ["fiat-sent"]),
        ("cash_in", "awaiting_fiat", "agent", []),
        ("cash_in", "fiat_sent", "agent", ["confirm", "dispute"]),
        ("cash_in", "fiat_sent", "user", ["dispute"]),
        ("cash_in", "releasing", "agent", ["confirm"]),
        ("cash_in", "completed", "agent", []),
        ("cash_in", "disputed", "user", []),
        ("cash_out", "awaiting_usdc", "user", ["usdc-sent"]),
        ("cash_out", "expired", "user", ["usdc-sent"]),
        ("cash_out", "usdc_locked", "agent", ["fiat-sent"]),
        ("cash_out", "fiat_sent", "user", ["confirm", "dispute"]),
        ("cash_out", "fiat_sent", "agent", ["dispute"]),
        ("cash_out", "refunding", "user", ["refund"]),
        ("cash_out", "refunded", "user", []),
    ],
)
def test_allowed_actions_follow_status_and_role(order_type, status, role, expected):
    assert actions(make_order(type=order_type, status=status), role) == expected


def test_an_expired_add_money_order_offers_nothing_and_refuses_payment():
    order = make_order(expires_at=NOW - timedelta(seconds=1))
    assert actions(order, "user") == []
    assert error_of(lifecycle.check, order, Action.FIAT_SENT, "user", NOW, POLICY).code == "ORDER_EXPIRED"


def test_refund_opens_only_after_the_payout_window():
    locked = make_order(type="cash_out", status="usdc_locked", locked_at=NOW - timedelta(hours=1))
    assert actions(locked, "user") == []
    error = error_of(lifecycle.check, locked, Action.REFUND, "user", NOW, POLICY)
    assert error.code == "REFUND_NOT_YET"
    assert error.details == {"refundAvailableAt": (NOW + timedelta(hours=1)).isoformat()}

    later = NOW + timedelta(hours=1)
    assert actions(locked, "user", later) == ["refund"]
    assert lifecycle.check(locked, Action.REFUND, "user", later, POLICY) is Decision.PROCEED


@pytest.mark.parametrize(
    ("order", "action", "role"),
    [
        (make_order(status="fiat_sent"), Action.FIAT_SENT, "user"),
        (make_order(status="completed"), Action.CONFIRM, "agent"),
        (make_order(status="disputed"), Action.DISPUTE, "agent"),
        (make_order(type="cash_out", status="fiat_sent"), Action.FIAT_SENT, "agent"),
        (make_order(type="cash_out", status="refunded"), Action.REFUND, "user"),
    ],
)
def test_repeating_a_finished_action_is_a_no_op(order, action, role):
    assert lifecycle.check(order, action, role, NOW, POLICY) is Decision.ALREADY_DONE


def test_only_the_agent_can_release_add_money_usdc():
    error = error_of(lifecycle.check, make_order(status="fiat_sent"), Action.CONFIRM, "user", NOW, POLICY)
    assert (error.code, error.message) == ("WRONG_PARTY", "Only the agent on this order can do this.")


def test_the_agent_cannot_confirm_before_payment_is_marked():
    assert error_of(lifecycle.check, make_order(status="awaiting_fiat"), Action.CONFIRM, "agent", NOW, POLICY).code == "INVALID_STATE"


@pytest.mark.parametrize(("order_type", "action"), [("cash_in", Action.USDC_SENT), ("cash_in", Action.REFUND)])
def test_cash_out_actions_are_rejected_on_add_money_orders(order_type, action):
    error = error_of(lifecycle.check, make_order(type=order_type), action, "user", NOW, POLICY)
    assert (error.code, error.message) == ("WRONG_ORDER_TYPE", "This only applies to cash-out orders.")


def test_require_type_names_the_expected_kind():
    assert error_of(lifecycle.require_type, make_order(type="cash_out"), "cash_in").message == "This only applies to add-money orders."


def test_orders_nobody_acted_on_are_due_to_expire():
    assert lifecycle.is_due_to_expire(make_order(expires_at=NOW), NOW)
    assert lifecycle.is_due_to_expire(make_order(type="cash_out", status="awaiting_usdc", expires_at=NOW), NOW)
    assert not lifecycle.is_due_to_expire(make_order(status="fiat_sent", expires_at=NOW - timedelta(hours=1)), NOW)
    assert not lifecycle.is_due_to_expire(make_order(expires_at=NOW + timedelta(seconds=1)), NOW)


def test_paid_out_cash_outs_auto_complete_after_the_dispute_window():
    paid = make_order(type="cash_out", status="fiat_sent", fiat_sent_at=NOW - timedelta(hours=24))
    assert lifecycle.is_due_to_auto_complete(paid, NOW, POLICY)
    assert not lifecycle.is_due_to_auto_complete(replace(paid, fiat_sent_at=NOW - timedelta(hours=23)), NOW, POLICY)
    assert not lifecycle.is_due_to_auto_complete(replace(paid, status="disputed"), NOW, POLICY)
