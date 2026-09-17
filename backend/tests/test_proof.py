from decimal import Decimal

from app.domain.proof import completed_orders, escrow_obligations, is_solvent

from .factories import make_totals


def test_the_escrow_owes_every_float_plus_open_cash_outs():
    assert escrow_obligations(make_totals()) == Decimal("75.0000000")


def test_solvency_compares_the_balance_with_what_is_owed():
    totals = make_totals()
    assert is_solvent(Decimal("75"), totals) is True
    assert is_solvent(Decimal("74.9999999"), totals) is False
    assert is_solvent(None, totals) is None


def test_completed_orders_count_both_kinds():
    assert completed_orders(make_totals(completed_cash_in=4, completed_cash_out=3)) == 7
