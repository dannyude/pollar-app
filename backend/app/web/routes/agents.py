from fastapi import APIRouter, Depends, Query

from ...deps import Deps
from ...services import agents
from ..dependencies import get_deps
from ..presenters import present_agent
from ..schemas import AgentView

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("", response_model=list[AgentView])
async def list_agents(country: str | None = Query(default=None, min_length=2, max_length=2, examples=["NG"]), deps: Deps = Depends(get_deps)) -> list[AgentView]:
    """Active agents with their rates and the USDC they can sell right now. Public."""
    return [present_agent(a) for a in await agents.list_available(deps, country)]
