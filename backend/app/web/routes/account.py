from fastapi import APIRouter, Depends

from ...deps import Deps
from ...domain.models import User
from ...services import agents
from ..dependencies import current_user, get_deps
from ..presenters import present_me
from ..schemas import MeView

router = APIRouter(prefix="/api", tags=["account"])


@router.get("/me", response_model=MeView)
async def me(user: User = Depends(current_user), deps: Deps = Depends(get_deps)) -> MeView:
    """The signed-in user, plus their agent desk if they run one."""
    return present_me(await agents.profile(deps, user))
