from decimal import Decimal

from app.domain.pricing import quote

from .factories import error_of, make_agent

AGENT = make_agent(rate_sell=Decimal("1620"), rate_buy=Decimal("1580"))


def test_add_money_from_fiat_rounds_usdc_down():
    q = quote("cash_in", AGENT, fiat_amount=Decimal("1000"))
    assert (q.fiat, q.usdc, q.rate) == (Decimal("1000.00"), Decimal("0.6172839"), Decimal("1620"))


def test_add_money_from_usdc_rounds_fiat_up():
    assert quote("cash_in", AGENT, usdc_amount=Decimal("1.2345678")).fiat == Decimal("2000.00")


def test_cash_out_from_fiat_rounds_usdc_up():
    assert quote("cash_out", AGENT, fiat_amount=Decimal("1000")).usdc == Decimal("0.6329114")


def test_cash_out_from_usdc_rounds_fiat_down():
    q = quote("cash_out", AGENT, usdc_amount=Decimal("1.2345678"))
    assert (q.fiat, q.rate) == (Decimal("1950.61"), Decimal("1580"))


def test_round_numbers_stay_exact():
    assert quote("cash_in", AGENT, fiat_amount=Decimal("8100")).usdc == Decimal("5.0000000")
    assert quote("cash_out", AGENT, usdc_amount=Decimal("10")).fiat == Decimal("15800.00")


def test_amounts_outside_the_agents_limits_are_refused():
    error = error_of(quote, "cash_in", make_agent(min_fiat=Decimal("5000")), fiat_amount=Decimal("100"))
    assert error.code == "AMOUNT_OUT_OF_RANGE"
    assert error.details == {"minFiat": "5000.00", "maxFiat": "1000000.00", "fiatAmount": "100.00"}


def test_amounts_that_round_to_zero_are_refused():
    assert error_of(quote, "cash_out", AGENT, usdc_amount=Decimal("0.0000001")).code == "AMOUNT_TOO_SMALL"


def test_exactly_one_amount_is_required():
    assert error_of(quote, "cash_in", AGENT).code == "VALIDATION_ERROR"
    assert error_of(quote, "cash_in", AGENT, fiat_amount=Decimal("1"), usdc_amount=Decimal("1")).code == "VALIDATION_ERROR"
