"""HTTP for orders: read the request, call one service function, present the result."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import JSONResponse

from ...deps import Deps
from ...domain.models import User
from ...services import orders
from ...services.orders import OrderSnapshot
from ..dependencies import current_user, get_deps, order_uuid
from ..presenters import present_order
from ..schemas import CreateOrderIn, DisputeIn, FiatSentIn, OrderView, UsdcSentIn

router = APIRouter(prefix="/api/orders", tags=["orders"])


def _respond(snapshot: OrderSnapshot, deps: Deps) -> OrderView | JSONResponse:
    """202 while an escrow payment is still landing; poll GET /api/orders/{id}."""
    view = present_order(snapshot, deps.stellar)
    return JSONResponse(view.model_dump(mode="json", by_alias=True), status_code=202) if snapshot.pending else view


@router.get("", response_model=list[OrderView])
async def list_orders(
    as_role: Literal["user", "agent"] = Query(default="user", alias="as"),
    scope: Literal["all", "open"] = "all",
    user: User = Depends(current_user),
    deps: Deps = Depends(get_deps),
) -> list[OrderView]:
    """Your orders (`as=user`) or your agent queue (`as=agent`). `scope=open` hides closed orders."""
    list_for = orders.list_as_agent if as_role == "agent" else orders.list_as_customer
    return [present_order(s, deps.stellar) for s in await list_for(deps, user, open_only=scope == "open")]


@router.post("", response_model=OrderView, status_code=201)
async def open_order(
    body: CreateOrderIn,
    user: User = Depends(current_user),
    deps: Deps = Depends(get_deps),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", max_length=200),
) -> OrderView:
    """Starts an add-money (`cash_in`) or cash-out (`cash_out`) order with an agent.

    Send `Idempotency-Key` (any unique string per intent) and a repeated request
    returns the order it already opened instead of opening a second one.
    """
    if body.type == "cash_in":
        snapshot = await orders.open_cash_in(
            deps, user, agent_id=body.agent_id, fiat_amount=body.fiat_amount, usdc_amount=body.usdc_amount,
            idempotency_key=idempotency_key,
        )
    else:
        snapshot = await orders.open_cash_out(
            deps, user, agent_id=body.agent_id, payout=body.payout, fiat_amount=body.fiat_amount,
            usdc_amount=body.usdc_amount, idempotency_key=idempotency_key,
        )
    return present_order(snapshot, deps.stellar)


@router.get("/{order_id}", response_model=OrderView)
async def get_order(order_id: UUID = Depends(order_uuid), user: User = Depends(current_user), deps: Deps = Depends(get_deps)) -> OrderView:
    """One order with its event timeline. Poll this every few seconds while it's open."""
    return present_order(await orders.get(deps, user, order_id), deps.stellar)


@router.post("/{order_id}/fiat-sent", response_model=OrderView)
async def fiat_sent(
    body: FiatSentIn | None = None,
    order_id: UUID = Depends(order_uuid),
    user: User = Depends(current_user),
    deps: Deps = Depends(get_deps),
) -> OrderView:
    """cash_in: customer says they paid the agent. cash_out: agent says they paid out (send `reference`)."""
    snapshot = await orders.mark_fiat_sent(deps, user, order_id, reference=body.reference if body else None)
    return present_order(snapshot, deps.stellar)


@router.post("/{order_id}/usdc-sent", response_model=OrderView)
async def usdc_sent(body: UsdcSentIn, order_id: UUID = Depends(order_uuid), user: User = Depends(current_user), deps: Deps = Depends(get_deps)) -> OrderView:
    """cash_out: customer attaches the hash from Pollar's runTx; it's verified on Stellar."""
    return present_order(await orders.attach_cash_out_payment(deps, user, order_id, body.tx_hash), deps.stellar)


@router.post("/{order_id}/confirm", response_model=OrderView, responses={202: {"model": OrderView}})
async def confirm(order_id: UUID = Depends(order_uuid), user: User = Depends(current_user), deps: Deps = Depends(get_deps)) -> OrderView | JSONResponse:
    """cash_in: agent confirms the fiat arrived, releasing USDC. cash_out: customer confirms the payout arrived."""
    return _respond(await orders.confirm(deps, user, order_id), deps)


@router.post("/{order_id}/refund", response_model=OrderView, responses={202: {"model": OrderView}})
async def refund(order_id: UUID = Depends(order_uuid), user: User = Depends(current_user), deps: Deps = Depends(get_deps)) -> OrderView | JSONResponse:
    """cash_out: after the payout window, return the customer's USDC from escrow."""
    return _respond(await orders.refund_cash_out(deps, user, order_id), deps)


@router.post("/{order_id}/dispute", response_model=OrderView)
async def dispute(body: DisputeIn, order_id: UUID = Depends(order_uuid), user: User = Depends(current_user), deps: Deps = Depends(get_deps)) -> OrderView:
    """Either side flags a fiat payment that didn't arrive. Funds stay where they are."""
    return present_order(await orders.dispute(deps, user, order_id, reason=body.reason), deps.stellar)
