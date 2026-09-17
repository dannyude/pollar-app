"""Reading who a request says it is. No network here: the Pollar gateway makes the
call, and these functions interpret the header and Pollar's answer."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from stellar_sdk import StrKey

from .errors import AppError, ErrorKind
from .models import User

TOKEN_CACHE_SECONDS = 60


@dataclass(frozen=True)
class BearerToken:
    token: str


@dataclass(frozen=True)
class DevCredentials:
    user_id: str
    wallet: str


@dataclass(frozen=True)
class Identity:
    user: User
    expires_at: float | None  # epoch seconds


def parse_authorization(header: str | None, *, dev_auth: bool) -> BearerToken | DevCredentials:
    """`Bearer <Pollar access token>`, or `Dev <userId> <G-address>` when dev auth is on."""
    parts = (header or "").split()
    if parts[:1] == ["Dev"] and dev_auth:
        if len(parts) != 3 or not StrKey.is_valid_ed25519_public_key(parts[2]):
            raise AppError(ErrorKind.UNAUTHENTICATED, "UNAUTHENTICATED", "Dev auth expects `Dev <userId> <G-address>`.")
        return DevCredentials(user_id=parts[1], wallet=parts[2])
    if len(parts) != 2 or parts[0] != "Bearer":
        raise AppError(ErrorKind.UNAUTHENTICATED, "UNAUTHENTICATED", "Sign in with Pollar and send the session token as a Bearer token.")
    return BearerToken(parts[1])


def dev_user(credentials: DevCredentials) -> User:
    return User(id=credentials.user_id, wallet=credentials.wallet, email=f"{credentials.user_id}@dev.local")


def identity_from_pollar(status: int, body: dict[str, Any]) -> Identity:
    """Interprets Pollar's `POST /v1/tokens/verify` response."""
    if status in (401, 403):
        raise AppError(ErrorKind.UNAUTHENTICATED, "UNAUTHENTICATED", "Your Pollar session has expired. Sign in again.", {"pollarCode": body.get("code")})
    content = body.get("content")
    if status != 200 or not body.get("success") or not isinstance(content, dict):
        raise AppError(ErrorKind.UPSTREAM, "AUTH_PROVIDER_ERROR", "Pollar couldn't verify your session.", {"status": status, "pollarCode": body.get("code")})

    user_id = content.get("userId")
    wallet = stellar_address_of(content.get("wallet"))
    if not user_id:
        raise AppError(ErrorKind.UPSTREAM, "AUTH_PROVIDER_ERROR", "Pollar returned a session without a user.")
    if not wallet:
        raise AppError(ErrorKind.FORBIDDEN, "NO_STELLAR_WALLET", "This Pollar account has no Stellar G-address wallet yet.")

    profile = content.get("profile")
    email = (profile.get("email") or profile.get("mail")) if isinstance(profile, dict) else None
    return Identity(User(id=str(user_id), wallet=wallet, email=email), epoch_seconds(content.get("expiresAt")))


def stellar_address_of(wallet: Any) -> str | None:
    """Accepts the wallet as a string or as an object carrying `address`/`publicKey`."""
    if isinstance(wallet, str):
        candidates = [wallet]
    elif isinstance(wallet, dict):
        candidates = [wallet.get("address"), wallet.get("publicKey")]
    else:
        candidates = []
    return next((c for c in candidates if isinstance(c, str) and StrKey.is_valid_ed25519_public_key(c)), None)


def epoch_seconds(value: Any) -> float | None:
    """Pollar may send seconds, milliseconds or an ISO timestamp."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value / 1000 if value > 1e12 else float(value)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None
    return None


def cache_until(now: float, identity: Identity) -> float:
    """A verified token is reused for a minute, never past its own expiry."""
    return min(now + TOKEN_CACHE_SECONDS, identity.expires_at if identity.expires_at is not None else float("inf"))
