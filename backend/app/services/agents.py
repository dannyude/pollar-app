"""Agent desks: who customers can trade with, and setting desks up."""

from dataclasses import dataclass, replace
from decimal import Decimal

from ..deps import Deps
from ..domain.models import Agent, AgentRegistration, User
from ..domain.rails import validate_details
from ..repositories import agents as agent_repo
from ..repositories import orders as order_repo
from ..repositories.db import transaction


@dataclass(frozen=True)
class AccountProfile:
    user: User
    desk: Agent | None
    open_orders: int = 0


async def list_available(deps: Deps, country: str | None) -> list[Agent]:
    async with transaction(deps.pool) as conn:
        return await agent_repo.list_active(conn, country)


async def profile(deps: Deps, user: User) -> AccountProfile:
    async with transaction(deps.pool) as conn:
        desk = await agent_repo.get_by_user(conn, user.id)
        open_orders = await order_repo.count_open_for_agent(conn, desk.id) if desk else 0
    return AccountProfile(user=user, desk=desk, open_orders=open_orders)


async def register(deps: Deps, registration: AgentRegistration, *, float_usdc: Decimal | None = None, add_float_usdc: Decimal | None = None) -> Agent:
    """Creates or updates a desk. The float is USDC the agent already holds in escrow."""
    details = validate_details(registration.rail, registration.pay_details, "payDetails")
    async with transaction(deps.pool) as conn:
        agent = await agent_repo.upsert(conn, replace(registration, pay_details=details))
        if float_usdc is not None:
            agent = await agent_repo.set_float(conn, agent.id, float_usdc)
        elif add_float_usdc is not None:
            await agent_repo.credit(conn, agent.id, add_float_usdc)
            agent = await agent_repo.get(conn, agent.id) or agent
    return agent
