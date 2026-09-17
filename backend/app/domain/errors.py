"""Business failures, described by what went wrong rather than by HTTP.

The web layer is the only place that turns an ErrorKind into a status code.
"""

from enum import Enum
from typing import Any


class ErrorKind(Enum):
    INVALID = "invalid"  # the request itself is malformed
    UNAUTHENTICATED = "unauthenticated"  # we don't know who is calling
    FORBIDDEN = "forbidden"  # we know who, and they may not do this
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"  # the current state doesn't allow it
    UNPROCESSABLE = "unprocessable"  # well-formed, but breaks a business rule
    UPSTREAM = "upstream"  # Stellar or Pollar failed us
    UNAVAILABLE = "unavailable"  # we can't serve it right now
    MISCONFIGURED = "misconfigured"  # the server is set up wrong


class AppError(Exception):
    def __init__(self, kind: ErrorKind, code: str, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.kind = kind
        self.code = code
        self.message = message
        self.details = details


def order_not_found() -> AppError:
    return AppError(ErrorKind.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found.")


def invalid_state(status: str, action: str) -> AppError:
    return AppError(ErrorKind.CONFLICT, "INVALID_STATE", f"Can't {action} an order that is {status.replace('_', ' ')}.", {"status": status})


def stellar_unavailable() -> AppError:
    return AppError(ErrorKind.UPSTREAM, "STELLAR_UNAVAILABLE", "Stellar didn't respond. Try again in a moment.")
