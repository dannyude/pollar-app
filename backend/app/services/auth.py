"""Who is calling: the Authorization header in, a known Puente user out."""

import time

from ..deps import Deps
from ..domain.auth import DevCredentials, cache_until, dev_user, parse_authorization
from ..domain.models import User
from ..gateways import pollar
from ..repositories import users as user_repo
from ..repositories.db import transaction


async def authenticate(deps: Deps, header: str | None) -> User:
    credentials = parse_authorization(header, dev_auth=deps.dev_auth)
    if isinstance(credentials, DevCredentials):
        return await _remember(deps, dev_user(credentials))

    now = time.time()
    cached = deps.token_cache.get(credentials.token, now)
    if cached is not None:
        return cached.value

    identity = await pollar.verify_token(deps.pollar, credentials.token)
    user = await _remember(deps, identity.user)
    deps.token_cache.put(credentials.token, user, until=cache_until(now, identity))
    return user


async def _remember(deps: Deps, user: User) -> User:
    async with transaction(deps.pool) as conn:
        return await user_repo.upsert(conn, user)
