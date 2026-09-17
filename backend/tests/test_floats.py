from decimal import Decimal

from app.domain.floats import available_usdc, ensure_can_reserve, max_cash_in_fiat, rate_for

from .factories import error_of, make_agent


def test_available_usdc_is_the_float_not_yet_promised():
    assert available_usdc(make_agent(float_usdc=Decimal("60"), reserved_usdc=Decimal("15"))) == Decimal("45")


def test_an_agent_can_promise_up_to_what_is_available():
    agent = make_agent(float_usdc=Decimal("60.0000000"), reserved_usdc=Decimal("40.0000000"))
    ensure_can_reserve(agent, Decimal("20"))
    error = error_of(ensure_can_reserve, agent, Decimal("20.0000001"))
    assert (error.code, error.details) == ("INSUFFICIENT_FLOAT", {"availableUsdc": "20.0000000"})


def test_customers_buy_at_the_sell_rate_and_sell_at_the_buy_rate():
    agent = make_agent()
    assert rate_for(agent, "cash_in") == agent.rate_sell
    assert rate_for(agent, "cash_out") == agent.rate_buy


def test_largest_add_money_order_is_capped_by_float_and_by_the_limit():
    agent = make_agent(float_usdc=Decimal("10"), reserved_usdc=Decimal("0"), rate_sell=Decimal("1620"))
    assert max_cash_in_fiat(agent) == Decimal("16200.00")
    assert max_cash_in_fiat(make_agent(float_usdc=Decimal("10"), max_fiat=Decimal("5000.00"))) == Decimal("5000.00")
