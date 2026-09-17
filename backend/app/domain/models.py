"""Puente's records: immutable data, no behavior. The rules that read them are
plain functions in the neighboring modules."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID

OrderType = Literal["cash_in", "cash_out"]
Role = Literal["user", "agent"]
Actor = Literal["user", "agent", "system"]


class PayoutKind(StrEnum):
    """The two ways USDC leaves escrow for an order."""

    RELEASE = "release"  # cash_in: the customer receives what they paid for
    REFUND = "refund"  # cash_out: the customer gets unpaid USDC back


@dataclass(frozen=True)
class User:
    id: str
    wallet: str
    email: str | None


@dataclass(frozen=True)
class Agent:
    id: UUID
    user_id: str
    display_name: str
    country: str
    currency: str
    rail: str
    pay_details: dict[str, Any]
    rate_buy: Decimal  # fiat per USDC the agent pays when a customer cashes out
    rate_sell: Decimal  # fiat per USDC a customer pays to add money
    min_fiat: Decimal
    max_fiat: Decimal
    float_usdc: Decimal  # agent-owned USDC held in escrow
    reserved_usdc: Decimal  # part of the float promised to open add-money orders
    active: bool


@dataclass(frozen=True)
class AgentRegistration:
    user_id: str
    display_name: str
    country: str
    currency: str
    rail: str
    pay_details: dict[str, Any]
    rate_buy: Decimal
    rate_sell: Decimal
    min_fiat: Decimal
    max_fiat: Decimal
    active: bool


@dataclass(frozen=True)
class EscrowEnvelope:
    """A signed escrow payment, saved before it's submitted."""

    hash: str
    xdr: str
    max_time: datetime


@dataclass(frozen=True)
class Order:
    id: UUID
    ref: str
    type: OrderType
    status: str
    user_id: str
    agent_id: UUID
    user_wallet: str
    currency: str
    fiat_amount: Decimal
    usdc_amount: Decimal
    rate: Decimal
    pay_details: dict[str, Any] | None
    payout_details: dict[str, Any] | None
    agent_reference: str | None
    funding_tx: str | None
    release: EscrowEnvelope | None
    refund: EscrowEnvelope | None
    dispute_reason: str | None
    expires_at: datetime | None
    locked_at: datetime | None
    fiat_sent_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class OrderEvent:
    from_status: str | None
    to_status: str
    actor: Actor
    meta: dict[str, Any]
    created_at: datetime


@dataclass(frozen=True)
class NewOrder:
    ref: str
    type: OrderType
    status: str
    user: User
    agent: Agent
    fiat_amount: Decimal
    usdc_amount: Decimal
    rate: Decimal
    pay_details: dict[str, Any] | None
    payout_details: dict[str, Any] | None
    expires_at: datetime


@dataclass(frozen=True)
class UsageTotals:
    users: int
    agents: int
    completed_cash_in: int
    completed_cash_out: int
    refunded: int
    volume_usdc: Decimal
    agent_float_usdc: Decimal
    locked_usdc: Decimal
