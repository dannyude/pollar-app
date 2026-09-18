from fastapi import APIRouter, Depends

from ...deps import Deps
from ...domain.models import User
from ...services import agents, wallet
from ..dependencies import current_user, get_deps
from ..presenters import present_me
from ..schemas import MeView, WalletActivationView

router = APIRouter(prefix="/api", tags=["account"])


@router.get("/me", response_model=MeView)
async def me(user: User = Depends(current_user), deps: Deps = Depends(get_deps)) -> MeView:
    """The signed-in user, plus their agent desk if they run one."""
    return present_me(await agents.profile(deps, user))


@router.post("/wallet/activate", response_model=WalletActivationView)
async def activate_wallet(user: User = Depends(current_user), deps: Deps = Depends(get_deps)) -> WalletActivationView:
    """Testnet only: create the caller's wallet on Stellar if it doesn't exist yet.

    Pollar's provisioning occasionally fails, leaving an address that Horizon has
    never heard of — and USDC can't be sent to an account that doesn't exist. Safe
    to call repeatedly; it does nothing when the account is already there.
    """
    done = await wallet.activate(deps, user)
    return WalletActivationView(address=done.address, funded=done.funded, can_hold_usdc=done.can_hold_usdc)
