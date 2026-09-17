"""How fiat moves on each side of an order.

The MVP ships one settlement mode, `manual_agent`: a person moves the fiat and
confirms it in the agent console. An automated rail (Paystack virtual accounts,
M-Pesa, ...) would add an entry here and confirm fiat from a webhook instead.
"""

from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pydantic.alias_generators import to_camel

from .errors import AppError, ErrorKind

PHONE = r"^\+?[0-9 ]{7,20}$"


class _Details(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, str_strip_whitespace=True)


class BankDetails(_Details):
    bank: str = Field(min_length=2, max_length=80)
    account_number: str = Field(pattern=r"^[0-9A-Za-z-]{4,34}$")
    account_name: str = Field(min_length=2, max_length=120)


class MobileMoneyDetails(_Details):
    provider: str = Field(min_length=2, max_length=60)
    phone_number: str = Field(pattern=PHONE)
    account_name: str = Field(min_length=2, max_length=120)


class CashDetails(_Details):
    location: str = Field(min_length=3, max_length=160)
    contact_phone: str = Field(pattern=PHONE)
    account_name: str = Field(min_length=2, max_length=120)


@dataclass(frozen=True)
class RailSpec:
    details: type[_Details]  # the account details this rail needs
    institution_field: str | None  # shown in public listings; None for cash
    settlement: str = "manual_agent"


RAILS: dict[str, RailSpec] = {
    "bank_transfer": RailSpec(BankDetails, "bank"),
    "mobile_money": RailSpec(MobileMoneyDetails, "provider"),
    "cash": RailSpec(CashDetails, None),
}


def validate_details(rail: str, raw: dict[str, Any] | None, field: str) -> dict[str, Any]:
    """Checks account details for a rail and returns them camelCased for storage."""
    try:
        return _spec(rail).details.model_validate(raw or {}).model_dump(by_alias=True)
    except ValidationError as exc:
        details = [{"path": ".".join([field, *(str(p) for p in err["loc"])]), "message": err["msg"]} for err in exc.errors()]
        raise AppError(ErrorKind.INVALID, "VALIDATION_ERROR", "Some fields are missing or invalid.", details) from exc


def institution(rail: str, details: dict[str, Any]) -> str | None:
    """Bank or provider name for public agent listings, never account numbers."""
    spec = _spec(rail)
    return details.get(to_camel(spec.institution_field)) if spec.institution_field else "Cash"


def _spec(rail: str) -> RailSpec:
    try:
        return RAILS[rail]
    except KeyError:
        raise ValueError(f"Unknown rail: {rail}") from None
