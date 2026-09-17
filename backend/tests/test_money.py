from decimal import Decimal

from app.domain.money import CEIL, FLOOR, fiat_for_usdc, fmt_fiat, fmt_rate, fmt_usdc, usdc_for_fiat


def test_amounts_are_formatted_to_their_precision():
    assert (fmt_usdc(Decimal("5")), fmt_fiat(Decimal("15800")), fmt_rate(Decimal("1620"))) == ("5.0000000", "15800.00", "1620.000000")


def test_rounding_direction_is_explicit():
    assert usdc_for_fiat(Decimal("1000"), Decimal("1620"), FLOOR) == Decimal("0.6172839")
    assert usdc_for_fiat(Decimal("1000"), Decimal("1620"), CEIL) == Decimal("0.6172840")
    assert fiat_for_usdc(Decimal("1.2345678"), Decimal("1620"), CEIL) == Decimal("2000.00")
    assert fiat_for_usdc(Decimal("1.2345678"), Decimal("1620"), FLOOR) == Decimal("1999.99")
