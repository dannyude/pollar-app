import pytest

from app.domain.auth import BearerToken, DevCredentials, Identity, cache_until, dev_user, epoch_seconds, identity_from_pollar, parse_authorization
from app.domain.models import User

from .factories import CUSTOMER, NOW, error_of

WALLET = CUSTOMER.wallet


def test_a_bearer_token_is_read_from_the_header():
    assert parse_authorization("Bearer abc.def", dev_auth=False) == BearerToken("abc.def")


@pytest.mark.parametrize("header", [None, "", "Bearer", "Token abc", "Bearer a b", f"Dev ada {WALLET}"])
def test_anything_else_is_unauthenticated_without_dev_auth(header):
    assert error_of(parse_authorization, header, dev_auth=False).code == "UNAUTHENTICATED"


def test_dev_credentials_work_only_when_dev_auth_is_on():
    assert parse_authorization(f"Dev ada {WALLET}", dev_auth=True) == DevCredentials("ada", WALLET)
    assert error_of(parse_authorization, "Dev ada not-a-wallet", dev_auth=True).code == "UNAUTHENTICATED"
    assert dev_user(DevCredentials("ada", WALLET)) == User("ada", WALLET, "ada@dev.local")


def pollar_ok(**content):
    return {"success": True, "code": "SERVER_TOKEN_VERIFIED", "content": {"userId": "u1", "wallet": {"type": "internal", "address": WALLET}, **content}}


def test_a_verified_pollar_session_becomes_a_user():
    identity = identity_from_pollar(200, pollar_ok(profile={"mail": "ada@example.com"}, expiresAt=1789650000000))
    assert identity == Identity(User("u1", WALLET, "ada@example.com"), 1789650000.0)


def test_the_wallet_may_also_arrive_as_a_plain_address():
    assert identity_from_pollar(200, pollar_ok(wallet=WALLET)).user.wallet == WALLET


@pytest.mark.parametrize("status", [401, 403])
def test_an_expired_session_is_unauthenticated(status):
    assert error_of(identity_from_pollar, status, {"code": "SDK_AUTH_TOKEN_EXPIRED"}).code == "UNAUTHENTICATED"


def test_a_session_without_a_stellar_wallet_is_forbidden():
    assert error_of(identity_from_pollar, 200, pollar_ok(wallet={"address": None})).code == "NO_STELLAR_WALLET"


@pytest.mark.parametrize(
    ("status", "body"),
    [
        (500, {}),
        (200, {"success": False, "content": {}}),
        (200, {"success": True, "content": "nope"}),
        (200, {"success": True, "content": {"wallet": WALLET}}),
    ],
)
def test_an_unexpected_pollar_answer_is_an_upstream_error(status, body):
    assert error_of(identity_from_pollar, status, body).code == "AUTH_PROVIDER_ERROR"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (1789650000, 1789650000.0),
        (1789650000000, 1789650000.0),
        ("2026-09-17T12:00:00Z", NOW.timestamp()),
        ("not a date", None),
        (True, None),
        (None, None),
    ],
)
def test_expiry_can_be_seconds_milliseconds_or_iso(value, expected):
    assert epoch_seconds(value) == expected


def test_a_cached_token_never_outlives_its_session():
    user = User("u1", WALLET, None)
    assert cache_until(1000.0, Identity(user, 1030.0)) == 1030.0
    assert cache_until(1000.0, Identity(user, 5000.0)) == 1060.0
    assert cache_until(1000.0, Identity(user, None)) == 1060.0
