from fastapi import APIRouter, Depends

from ...deps import Deps
from ...services import proof
from ..dependencies import get_deps
from ..presenters import present_proof
from ..schemas import ProofView

router = APIRouter(prefix="/api/proof", tags=["proof"])


@router.get("", response_model=ProofView)
async def get_proof(deps: Deps = Depends(get_deps)) -> ProofView:
    """Public usage totals, escrow solvency and recent settled orders with Stellar links."""
    return present_proof(await proof.snapshot(deps), deps.stellar)
