"""What an order costs, at the agent's posted rate."""

from dataclasses import dataclass
from decimal import Decimal

from .errors import AppError, ErrorKind
from .floats import rate_for
from .models import Agent, OrderType
from .money import CEIL, FIAT_Q, FLOOR, USDC_Q, fiat_for_usdc, fmt_fiat, usdc_for_fiat


@dataclass(frozen=True)
class Quote:
    fiat: Decimal
    usdc: Decimal
    rate: Decimal


def quote(order_type: OrderType, agent: Agent, *, fiat_amount: Decimal | None = None, usdc_amount: Decimal | None = None) -> Quote:
    """Prices an order from exactly one of the two amounts.

    Rounds against the customer by at most one minor unit, so the escrow never
    pays out more than it took in:
      add money, fiat given → USDC rounded down · USDC given → fiat rounded up
      cash out,  fiat given → USDC rounded up   · USDC given → fiat rounded down
    """
    cash_in = order_type == "cash_in"
    rate = rate_for(agent, order_type)
    if fiat_amount is not None and usdc_amount is None:
        fiat = fiat_amount.quantize(FIAT_Q)
        usdc = usdc_for_fiat(fiat, rate, FLOOR if cash_in else CEIL)
    elif usdc_amount is not None and fiat_amount is None:
        usdc = usdc_amount.quantize(USDC_Q)
        fiat = fiat_for_usdc(usdc, rate, CEIL if cash_in else FLOOR)
    else:
        raise AppError(ErrorKind.INVALID, "VALIDATION_ERROR", "Send exactly one of fiatAmount or usdcAmount.")

    if usdc <= 0 or fiat <= 0:
        raise AppError(ErrorKind.UNPROCESSABLE, "AMOUNT_TOO_SMALL", "That amount is too small to convert.")
    if not agent.min_fiat <= fiat <= agent.max_fiat:
        raise AppError(
            ErrorKind.UNPROCESSABLE,
            "AMOUNT_OUT_OF_RANGE",
            f"This agent handles {fmt_fiat(agent.min_fiat)} to {fmt_fiat(agent.max_fiat)} {agent.currency}.",
            {"minFiat": fmt_fiat(agent.min_fiat), "maxFiat": fmt_fiat(agent.max_fiat), "fiatAmount": fmt_fiat(fiat)},
        )
    return Quote(fiat=fiat, usdc=usdc, rate=rate)
