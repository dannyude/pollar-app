"""Ready-made records for unit tests. Override any field: make_order(status="fiat_sent")."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import pytest
from stellar_sdk import Keypair

from app.domain.errors import AppError
from app.domain.funding import Asset
from app.domain.lifecycle import Policy
from app.domain.models import Agent, EscrowEnvelope, Order, User, UsageTotals


def address(n: int) -> str:
    """A valid, deterministic Stellar G-address."""
    return Keypair.from_raw_ed25519_seed(bytes([n]) * 32).public_key


NOW = datetime(2026, 9, 17, 12, 0, tzinfo=UTC)
POLICY = Policy(payout_window=timedelta(hours=2), auto_complete_after=timedelta(hours=24))

ESCROW = address(1)
USDC = Asset("USDC", address(2))
CUSTOMER = User(id="ada", wallet=address(3), email="ada@example.com")
AGENT_USER = User(id="tunde", wallet=address(4), email=None)
STRANGER = User(id="stranger", wallet=address(5), email=None)
AGENT_ID = UUID(int=1)
ORDER_ID = UUID(int=2)


def make_agent(**changes: object) -> Agent:
    agent = Agent(
        id=AGENT_ID,
        user_id=AGENT_USER.id,
        display_name="Tunde · Yaba",
        country="NG",
        currency="NGN",
        rail="bank_transfer",
        pay_details={"bank": "GTBank", "accountNumber": "0123456789", "accountName": "Tunde Bello"},
        rate_buy=Decimal("1580.000000"),
        rate_sell=Decimal("1620.000000"),
        min_fiat=Decimal("0.00"),
        max_fiat=Decimal("1000000.00"),
        float_usdc=Decimal("60.0000000"),
        reserved_usdc=Decimal("0.0000000"),
        active=True,
    )
    return replace(agent, **changes)


def make_order(**changes: object) -> Order:
    order = Order(
        id=ORDER_ID,
        ref="PU-7KQ2AB",
        type="cash_in",
        status="awaiting_fiat",
        user_id=CUSTOMER.id,
        agent_id=AGENT_ID,
        user_wallet=CUSTOMER.wallet,
        currency="NGN",
        fiat_amount=Decimal("8100.00"),
        usdc_amount=Decimal("5.0000000"),
        rate=Decimal("1620.000000"),
        pay_details=make_agent().pay_details,
        payout_details=None,
        agent_reference=None,
        funding_tx=None,
        release=None,
        refund=None,
        dispute_reason=None,
        expires_at=NOW + timedelta(minutes=30),
        locked_at=None,
        fiat_sent_at=None,
        completed_at=None,
        created_at=NOW,
        updated_at=NOW,
    )
    return replace(order, **changes)


def make_envelope(**changes: object) -> EscrowEnvelope:
    return replace(EscrowEnvelope(hash="a" * 64, xdr="AAAA", max_time=NOW + timedelta(seconds=120)), **changes)


def make_totals(**changes: object) -> UsageTotals:
    totals = UsageTotals(
        users=3,
        agents=1,
        completed_cash_in=1,
        completed_cash_out=1,
        refunded=1,
        volume_usdc=Decimal("15.0000000"),
        agent_float_usdc=Decimal("65.0000000"),
        locked_usdc=Decimal("10.0000000"),
    )
    return replace(totals, **changes)


def error_of(fn, *args, **kwargs) -> AppError:
    """Calls fn, expecting it to raise AppError, and returns the error."""
    with pytest.raises(AppError) as caught:
        fn(*args, **kwargs)
    return caught.value
