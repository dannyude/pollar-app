"""What a route can ask for: the dependencies, the caller, and a parsed order id."""

from uuid import UUID

from fastapi import Depends, Request, Security
from fastapi.security import APIKeyHeader

from ..deps import Deps
from ..domain.errors import order_not_found
from ..domain.models import User
from ..services.auth import authenticate

# Shows an "Authorize" button in /docs. Paste `Bearer <Pollar access token>`.
authorization_header = APIKeyHeader(name="Authorization", auto_error=False)


def get_deps(request: Request) -> Deps:
    return request.app.state.deps


async def current_user(authorization: str | None = Security(authorization_header), deps: Deps = Depends(get_deps)) -> User:
    return await authenticate(deps, authorization)


def order_uuid(order_id: str) -> UUID:
    """A malformed id is simply an order that doesn't exist."""
    try:
        return UUID(order_id)
    except ValueError:
        raise order_not_found() from None
