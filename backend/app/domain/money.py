"""Decimal money math — never floats.

USDC has 7 decimals on Stellar, fiat is kept to the minor unit (2), rates to 6.
Rounding always favors the side that has to move money second, so the agent's
float and the escrow can never come up short.
"""

from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal

USDC_Q = Decimal("0.0000001")
FIAT_Q = Decimal("0.01")
RATE_Q = Decimal("0.000001")

FLOOR = ROUND_FLOOR
CEIL = ROUND_CEILING


def usdc_for_fiat(fiat: Decimal, rate: Decimal, rounding: str) -> Decimal:
    """USDC for a fiat amount at `rate` fiat per USDC."""
    return (fiat / rate).quantize(USDC_Q, rounding=rounding)


def fiat_for_usdc(usdc: Decimal, rate: Decimal, rounding: str) -> Decimal:
    """Fiat for a USDC amount at `rate` fiat per USDC."""
    return (usdc * rate).quantize(FIAT_Q, rounding=rounding)


def fmt_usdc(value: Decimal) -> str:
    return f"{value.quantize(USDC_Q):f}"


def fmt_fiat(value: Decimal) -> str:
    return f"{value.quantize(FIAT_Q):f}"


def fmt_rate(value: Decimal) -> str:
    return f"{value.quantize(RATE_Q):f}"
