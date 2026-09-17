"""What an agent's USDC float allows."""

from decimal import Decimal

from .errors import AppError, ErrorKind
from .models import Agent, OrderType
from .money import FLOOR, fiat_for_usdc, fmt_usdc


def available_usdc(agent: Agent) -> Decimal:
    return agent.float_usdc - agent.reserved_usdc


def rate_for(agent: Agent, order_type: OrderType) -> Decimal:
    """Customers buy USDC at the agent's sell rate and sell it at the buy rate."""
    return agent.rate_sell if order_type == "cash_in" else agent.rate_buy


def max_cash_in_fiat(agent: Agent) -> Decimal:
    """The largest add-money order the agent can take right now, in fiat."""
    return min(fiat_for_usdc(available_usdc(agent), agent.rate_sell, FLOOR), agent.max_fiat)


def ensure_can_reserve(agent: Agent, usdc: Decimal) -> None:
    available = available_usdc(agent)
    if available < usdc:
        raise AppError(
            ErrorKind.CONFLICT,
            "INSUFFICIENT_FLOAT",
            f"This agent can sell up to {fmt_usdc(available)} USDC right now.",
            {"availableUsdc": fmt_usdc(available)},
        )
