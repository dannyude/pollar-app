"""Service results → API responses. Pure functions: they know both shapes and decide nothing."""

from ..domain.floats import available_usdc, max_cash_in_fiat
from ..domain.models import Agent, Order
from ..domain.money import fmt_fiat, fmt_rate, fmt_usdc
from ..domain.proof import completed_orders, escrow_obligations, is_solvent
from ..domain.rails import institution
from ..gateways import stellar
from ..gateways.stellar import StellarClient
from ..services.agents import AccountProfile
from ..services.orders import OrderSnapshot
from ..services.proof import ProofSnapshot
from .schemas import (
    AgentRef,
    AgentSelf,
    AgentView,
    AssetRef,
    EscrowTarget,
    Hashes,
    MeView,
    OrderEventOut,
    OrderView,
    ProofEscrow,
    ProofOrder,
    ProofTotals,
    ProofView,
    TxLink,
    UserOut,
)


def present_order(snap: OrderSnapshot, client: StellarClient) -> OrderView:
    order, agent = snap.order, snap.agent
    cash_in = order.type == "cash_in"
    return OrderView(
        id=str(order.id),
        ref=order.ref,
        type=order.type,
        status=order.status,
        viewer_role=snap.role,
        actions=[action.value for action in snap.actions],
        currency=order.currency,
        fiat_amount=fmt_fiat(order.fiat_amount),
        usdc_amount=fmt_usdc(order.usdc_amount),
        rate=fmt_rate(order.rate),
        agent=AgentRef(id=str(agent.id), name=agent.display_name, rail=agent.rail),
        user_wallet=order.user_wallet,
        pay={**order.pay_details, "rail": agent.rail, "reference": order.ref} if cash_in and order.pay_details else None,
        escrow=None
        if cash_in
        else EscrowTarget(
            address=stellar.escrow_address(client),
            asset=AssetRef(code=client.usdc.code, issuer=client.usdc.issuer),
            memo=order.ref,
        ),
        payout=order.payout_details,
        agent_reference=order.agent_reference,
        dispute_reason=order.dispute_reason,
        hashes=_hashes(order, client),
        expires_at=order.expires_at,
        locked_at=order.locked_at,
        refund_available_at=snap.refund_available_at,
        fiat_sent_at=order.fiat_sent_at,
        completed_at=order.completed_at,
        created_at=order.created_at,
        pending=snap.pending,
        events=None
        if snap.events is None
        else [OrderEventOut(from_status=e.from_status, to=e.to_status, actor=e.actor, at=e.created_at, meta=e.meta) for e in snap.events],
    )


def present_agent(agent: Agent) -> AgentView:
    return AgentView(
        id=str(agent.id),
        name=agent.display_name,
        country=agent.country,
        currency=agent.currency,
        rail=agent.rail,
        institution=institution(agent.rail, agent.pay_details),
        rate_buy=fmt_rate(agent.rate_buy),
        rate_sell=fmt_rate(agent.rate_sell),
        min_fiat=fmt_fiat(agent.min_fiat),
        max_fiat=fmt_fiat(agent.max_fiat),
        available_usdc=fmt_usdc(available_usdc(agent)),
        max_cash_in_fiat=fmt_fiat(max_cash_in_fiat(agent)),
    )


def present_me(profile: AccountProfile) -> MeView:
    desk = profile.desk
    return MeView(
        user=UserOut(id=profile.user.id, wallet=profile.user.wallet, email=profile.user.email),
        agent=None
        if desk is None
        else AgentSelf(
            **present_agent(desk).model_dump(),
            float_usdc=fmt_usdc(desk.float_usdc),
            reserved_usdc=fmt_usdc(desk.reserved_usdc),
            open_orders=profile.open_orders,
        ),
    )


def present_proof(snap: ProofSnapshot, client: StellarClient) -> ProofView:
    t = snap.totals
    return ProofView(
        network=client.network,
        escrow=ProofEscrow(
            address=snap.escrow_address,
            url=stellar.account_url(client, snap.escrow_address),
            usdc_balance=fmt_usdc(snap.escrow_usdc) if snap.escrow_usdc is not None else None,
            obligations_usdc=fmt_usdc(escrow_obligations(t)),
            solvent=is_solvent(snap.escrow_usdc, t),
        ),
        totals=ProofTotals(
            users=t.users,
            agents=t.agents,
            completed_orders=completed_orders(t),
            completed_cash_in=t.completed_cash_in,
            completed_cash_out=t.completed_cash_out,
            refunded=t.refunded,
            volume_usdc=fmt_usdc(t.volume_usdc),
        ),
        recent=[
            ProofOrder(
                ref=o.ref,
                type=o.type,
                status=o.status,
                currency=o.currency,
                fiat_amount=fmt_fiat(o.fiat_amount),
                usdc_amount=fmt_usdc(o.usdc_amount),
                completed_at=o.completed_at,
                hashes=_hashes(o, client),
            )
            for o in snap.recent
        ],
    )


def _hashes(order: Order, client: StellarClient) -> Hashes:
    return Hashes(
        funding=_link(order.funding_tx, client),
        release=_link(order.release.hash if order.release else None, client),
        refund=_link(order.refund.hash if order.refund else None, client),
    )


def _link(tx_hash: str | None, client: StellarClient) -> TxLink | None:
    return TxLink(hash=tx_hash, url=stellar.tx_url(client, tx_hash)) if tx_hash else None
