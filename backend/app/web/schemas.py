"""Request and response models. JSON is camelCase, and every amount leaves the API as a
decimal string. FastAPI publishes these shapes at /docs and /openapi.json."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

OrderType = Literal["cash_in", "cash_out"]
OrderStatus = Literal[
    "awaiting_fiat",
    "fiat_sent",
    "releasing",
    "completed",
    "expired",
    "disputed",
    "awaiting_usdc",
    "usdc_locked",
    "refunding",
    "refunded",
]
OrderAction = Literal["fiat-sent", "usdc-sent", "confirm", "refund", "dispute"]
Rail = Literal["bank_transfer", "mobile_money", "cash"]
Role = Literal["user", "agent"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, str_strip_whitespace=True)


# ─── Requests ───────────────────────────────────────────────────────────────────


class CreateOrderIn(CamelModel):
    type: OrderType
    agent_id: UUID
    fiat_amount: Decimal | None = Field(
        default=None, gt=0, max_digits=18, decimal_places=2, description="Fiat to pay (cash_in) or receive (cash_out)."
    )
    usdc_amount: Decimal | None = Field(
        default=None, gt=0, max_digits=20, decimal_places=7, description="USDC to receive (cash_in) or send (cash_out)."
    )
    payout: dict[str, Any] | None = Field(
        default=None,
        description="cash_out only: where the agent pays you. Bank rails take {bank, accountNumber, accountName}.",
    )

    @model_validator(mode="after")
    def one_amount_and_payout(self) -> "CreateOrderIn":
        if (self.fiat_amount is None) == (self.usdc_amount is None):
            raise ValueError("Send exactly one of fiatAmount or usdcAmount.")
        if self.type == "cash_out" and self.payout is None:
            raise ValueError("Cash-out orders need payout details.")
        return self


class FiatSentIn(CamelModel):
    reference: str | None = Field(
        default=None, min_length=3, max_length=100, description="cash_out: the bank or mobile-money reference of your payout."
    )


class UsdcSentIn(CamelModel):
    tx_hash: str = Field(pattern=r"^[0-9a-fA-F]{64}$", description="Hash returned by Pollar's runTx.")


class DisputeIn(CamelModel):
    reason: str = Field(min_length=5, max_length=500)


# ─── Responses ──────────────────────────────────────────────────────────────────


class TxLink(CamelModel):
    hash: str
    url: str


class Hashes(CamelModel):
    funding: TxLink | None
    release: TxLink | None
    refund: TxLink | None


class AgentRef(CamelModel):
    id: str
    name: str
    rail: Rail


class AssetRef(CamelModel):
    code: str
    issuer: str


class EscrowTarget(CamelModel):
    address: str
    asset: AssetRef
    memo: str


class OrderEventOut(CamelModel):
    from_status: OrderStatus | None = Field(alias="from")
    to: OrderStatus
    actor: Literal["user", "agent", "system"]
    at: datetime
    meta: dict[str, Any]


class OrderView(CamelModel):
    id: str
    ref: str
    type: OrderType
    status: OrderStatus
    viewer_role: Role
    actions: list[OrderAction]
    currency: str
    fiat_amount: str
    usdc_amount: str
    rate: str
    agent: AgentRef
    user_wallet: str
    pay: dict[str, Any] | None = Field(description="cash_in: the agent account to pay, plus rail and reference.")
    escrow: EscrowTarget | None = Field(description="cash_out: send USDC here with this memo.")
    payout: dict[str, Any] | None = Field(description="cash_out: where the agent sends fiat.")
    agent_reference: str | None
    dispute_reason: str | None
    hashes: Hashes
    expires_at: datetime | None
    locked_at: datetime | None
    refund_available_at: datetime | None
    fiat_sent_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    pending: bool = Field(default=False, description="True while an escrow payment is still settling (HTTP 202).")
    events: list[OrderEventOut] | None = Field(default=None, description="Only on GET /api/orders/{id}.")


class AgentView(CamelModel):
    id: str
    name: str
    country: str
    currency: str
    rail: Rail
    institution: str | None
    rate_buy: str = Field(description="Fiat per USDC the agent pays when you cash out.")
    rate_sell: str = Field(description="Fiat per USDC you pay when you add money.")
    min_fiat: str
    max_fiat: str
    available_usdc: str
    max_cash_in_fiat: str


class AgentSelf(AgentView):
    float_usdc: str
    reserved_usdc: str
    open_orders: int


class UserOut(CamelModel):
    id: str
    wallet: str
    email: str | None


class MeView(CamelModel):
    user: UserOut
    agent: AgentSelf | None


class ProofEscrow(CamelModel):
    address: str
    url: str
    usdc_balance: str | None
    obligations_usdc: str = Field(description="Agent floats plus users' USDC locked in open cash-outs.")
    solvent: bool | None


class ProofTotals(CamelModel):
    users: int
    agents: int
    completed_orders: int
    completed_cash_in: int
    completed_cash_out: int
    refunded: int
    volume_usdc: str


class ProofOrder(CamelModel):
    ref: str
    type: OrderType
    status: Literal["completed", "refunded"]
    currency: str
    fiat_amount: str
    usdc_amount: str
    completed_at: datetime
    hashes: Hashes


class ProofView(CamelModel):
    network: Literal["testnet", "mainnet"]
    escrow: ProofEscrow
    totals: ProofTotals
    recent: list[ProofOrder]


class WalletActivationView(CamelModel):
    """What `POST /api/wallet/activate` did, and where the wallet stands now."""

    address: str
    funded: bool
    can_hold_usdc: bool
