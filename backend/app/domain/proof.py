"""What the escrow owes, and whether it holds enough."""

from decimal import Decimal

from .models import UsageTotals


def completed_orders(totals: UsageTotals) -> int:
    return totals.completed_cash_in + totals.completed_cash_out


def escrow_obligations(totals: UsageTotals) -> Decimal:
    """Every agent's float plus customers' USDC locked in open cash-outs."""
    return totals.agent_float_usdc + totals.locked_usdc


def is_solvent(escrow_usdc: Decimal | None, totals: UsageTotals) -> bool | None:
    """None when the escrow balance couldn't be read."""
    return None if escrow_usdc is None else escrow_usdc >= escrow_obligations(totals)
