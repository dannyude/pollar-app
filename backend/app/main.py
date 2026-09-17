import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .deps import close_deps, open_deps
from .services import maintenance
from .web.errors import install_error_handlers
from .web.routes import account, agents, orders, proof

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    deps = await open_deps(settings())
    app.state.deps = deps
    loop = asyncio.create_task(maintenance.run_forever(deps)) if deps.maintenance_interval_seconds > 0 else None
    try:
        yield
    finally:
        if loop is not None:
            loop.cancel()
            with suppress(asyncio.CancelledError):
                await loop
        await close_deps(deps)


app = FastAPI(
    title="Puente API",
    version="0.3.0",
    description=(
        "Agent-powered cash-in and cash-out for Pollar wallets, with a Stellar escrow.\n\n"
        "Authenticate with `Authorization: Bearer <Pollar access token>` "
        "(from `getAuthState().session.token.accessToken`). "
        'Errors always look like `{ "error": { "code", "message", "details" } }`.'
    ),
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings().cors_origin_list,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)
install_error_handlers(app)
for module in (account, agents, orders, proof):
    app.include_router(module.router)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, object]:
    return {"ok": True, "network": settings().stellar_network}
