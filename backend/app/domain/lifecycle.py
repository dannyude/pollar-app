"""The order state machine, in one place.

Answers two questions with the same rules, so they can never disagree:
  - may this person do this to this order right now?   → `check`
  - what may this person do to this order right now?   → `allowed_actions`

cash_in  (add money): awaiting_fiat → fiat_sent → releasing → completed     (+ expired, disputed)
cash_out (cash out):  awaiting_usdc → usdc_locked → fiat_sent → completed   (+ expired, refunding → refunded, disputed)
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum, StrEnum

from .errors import AppError, ErrorKind, invalid_state, order_not_found
from .models import Agent, Order, OrderType, PayoutKind, Role, User


class Action(StrEnum):
    FIAT_SENT = "fiat-sent"
    USDC_SENT = "usdc-sent"
    CONFIRM = "confirm"
    REFUND = "refund"
    DISPUTE = "dispute"


class Decision(Enum):
    PROCEED = "proceed"
    ALREADY_DONE = "already_done"  # the action's effect already happened: repeat calls are no-ops


@dataclass(frozen=True)
class Policy:
    payout_window: timedelta  # how long an agent has to pay out a cash-out before the customer may refund
    auto_complete_after: timedelta  # how long a customer has to dispute a cash-out payout


@dataclass(frozen=True)
class Rule:
    roles: frozenset[Role]
    acts_on: frozenset[str]  # statuses where the action does its work
    done_in: frozenset[str] = frozenset()  # statuses where its work is already done


def _rule(roles: set[Role], acts_on: set[str], done_in: set[str] | None = None) -> Rule:
    return Rule(frozenset(roles), frozenset(acts_on), frozenset(done_in or ()))


RULES: dict[tuple[OrderType, Action], Rule] = {
    ("cash_in", Action.FIAT_SENT): _rule({"user"}, {"awaiting_fiat"}, {"fiat_sent"}),
    ("cash_in", Action.CONFIRM): _rule({"agent"}, {"fiat_sent", "releasing"}, {"completed"}),  # releasing: retry
    ("cash_in", Action.DISPUTE): _rule({"user", "agent"}, {"fiat_sent"}, {"disputed"}),
    ("cash_out", Action.USDC_SENT): _rule({"user"}, {"awaiting_usdc", "expired"}),  # late USDC is still honored
    ("cash_out", Action.FIAT_SENT): _rule({"agent"}, {"usdc_locked"}, {"fiat_sent"}),
    ("cash_out", Action.CONFIRM): _rule({"user"}, {"fiat_sent"}, {"completed"}),
    ("cash_out", Action.REFUND): _rule({"user"}, {"usdc_locked", "refunding"}, {"refunded"}),  # refunding: retry
    ("cash_out", Action.DISPUTE): _rule({"user", "agent"}, {"fiat_sent"}, {"disputed"}),
}

# While an escrow payment is landing the order sits in its settling status,
# and moves to its settled status once the payment is confirmed on Stellar.
SETTLING = {PayoutKind.RELEASE: "releasing", PayoutKind.REFUND: "refunding"}
SETTLED = {PayoutKind.RELEASE: "completed", PayoutKind.REFUND: "refunded"}

VERB = {
    Action.FIAT_SENT: "mark as paid",
    Action.USDC_SENT: "attach a payment to",
    Action.CONFIRM: "confirm",
    Action.REFUND: "refund",
    Action.DISPUTE: "dispute",
}


def role_of(order: Order, user: User, agent: Agent) -> Role:
    """The caller's side of this order. Strangers can't tell the order exists."""
    if user.id == order.user_id:
        return "user"
    if user.id == agent.user_id:
        return "agent"
    raise order_not_found()


def is_expired(order: Order, now: datetime) -> bool:
    return order.expires_at is not None and order.expires_at <= now


def refund_available_at(order: Order, policy: Policy) -> datetime | None:
    if order.type != "cash_out" or order.locked_at is None:
        return None
    return order.locked_at + policy.payout_window


def require_type(order: Order, order_type: OrderType) -> None:
    if order.type != order_type:
        raise _wrong_type(order_type)


def is_due_to_expire(order: Order, now: datetime) -> bool:
    """Nobody acted in time: the customer never paid, or no USDC arrived."""
    return order.status in ("awaiting_fiat", "awaiting_usdc") and is_expired(order, now)


def is_due_to_auto_complete(order: Order, now: datetime, policy: Policy) -> bool:
    """The agent paid out and the customer neither confirmed nor disputed in time."""
    return (
        order.type == "cash_out"
        and order.status == "fiat_sent"
        and order.fiat_sent_at is not None
        and order.fiat_sent_at + policy.auto_complete_after <= now
    )


def rule_for(order: Order, action: Action, role: Role) -> Rule:
    """The rule for this action on this kind of order, if this side may use it."""
    rule = RULES.get((order.type, action))
    if rule is None:  # the action only exists for the other kind of order
        raise _wrong_type("cash_out" if order.type == "cash_in" else "cash_in")
    if role not in rule.roles:
        who = "agent" if "agent" in rule.roles else "customer"
        raise AppError(ErrorKind.FORBIDDEN, "WRONG_PARTY", f"Only the {who} on this order can do this.")
    return rule


def check(order: Order, action: Action, role: Role, now: datetime, policy: Policy) -> Decision:
    """Raises if the action isn't allowed; otherwise says whether there is work to do."""
    rule = rule_for(order, action, role)
    if order.status in rule.done_in:
        return Decision.ALREADY_DONE
    if order.status not in rule.acts_on:
        raise invalid_state(order.status, VERB[action])
    _check_timing(order, action, now, policy)
    return Decision.PROCEED


def allowed_actions(order: Order, role: Role, now: datetime, policy: Policy) -> list[Action]:
    allowed = []
    for action in Action:
        rule = RULES.get((order.type, action))
        if rule is None or role not in rule.roles or order.status not in rule.acts_on:
            continue
        try:
            _check_timing(order, action, now, policy)
        except AppError:
            continue
        allowed.append(action)
    return allowed


def _check_timing(order: Order, action: Action, now: datetime, policy: Policy) -> None:
    if order.type == "cash_in" and action is Action.FIAT_SENT and is_expired(order, now):
        raise AppError(ErrorKind.CONFLICT, "ORDER_EXPIRED", "This order expired before payment was marked. Start a new one.")
    if order.type == "cash_out" and action is Action.REFUND and order.status == "usdc_locked":
        available_at = refund_available_at(order, policy)
        if available_at is None or available_at > now:
            raise AppError(
                ErrorKind.CONFLICT,
                "REFUND_NOT_YET",
                "The agent still has time to pay out. You can refund once the payout window ends.",
                {"refundAvailableAt": available_at.isoformat() if available_at else None},
            )


def _wrong_type(expected: OrderType) -> AppError:
    kind = "add-money" if expected == "cash_in" else "cash-out"
    return AppError(ErrorKind.CONFLICT, "WRONG_ORDER_TYPE", f"This only applies to {kind} orders.")
