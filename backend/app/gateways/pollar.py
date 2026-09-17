"""Asking Pollar who a session token belongs to (Server API: POST /v1/tokens/verify).
HTTP only; `domain.auth` interprets the answer."""

from dataclasses import dataclass

import httpx

from ..domain.auth import Identity, identity_from_pollar
from ..domain.errors import AppError, ErrorKind


@dataclass(frozen=True)
class PollarClient:
    http: httpx.AsyncClient
    api_url: str
    secret_key: str | None


def open_client(*, api_url: str, secret_key: str | None, timeout_s: float = 8.0) -> PollarClient:
    return PollarClient(http=httpx.AsyncClient(timeout=timeout_s), api_url=api_url.rstrip("/"), secret_key=secret_key)


async def close_client(client: PollarClient) -> None:
    await client.http.aclose()


async def verify_token(client: PollarClient, token: str) -> Identity:
    if not client.secret_key:
        raise AppError(ErrorKind.MISCONFIGURED, "AUTH_NOT_CONFIGURED", "POLLAR_SECRET_KEY is not set on the server.")
    try:
        res = await client.http.post(f"{client.api_url}/v1/tokens/verify", headers={"x-pollar-api-key": client.secret_key}, json={"token": token})
    except httpx.HTTPError as exc:
        raise AppError(ErrorKind.UPSTREAM, "AUTH_PROVIDER_UNAVAILABLE", "Couldn't reach Pollar to check your session. Try again.") from exc
    try:
        body = res.json()
    except ValueError:
        body = {}
    return identity_from_pollar(res.status_code, body if isinstance(body, dict) else {})
