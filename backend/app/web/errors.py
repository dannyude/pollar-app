"""The only place that knows how business failures become HTTP responses."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..domain.errors import AppError, ErrorKind

log = logging.getLogger("puente")

HTTP_STATUS = {
    ErrorKind.INVALID: 400,
    ErrorKind.UNAUTHENTICATED: 401,
    ErrorKind.FORBIDDEN: 403,
    ErrorKind.NOT_FOUND: 404,
    ErrorKind.CONFLICT: 409,
    ErrorKind.UNPROCESSABLE: 422,
    ErrorKind.MISCONFIGURED: 500,
    ErrorKind.UPSTREAM: 502,
    ErrorKind.UNAVAILABLE: 503,
}


def error_body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return {"error": error}


def install_error_handlers(app: FastAPI) -> None:
    """Every error leaves the API as `{ "error": { code, message, details? } }`."""

    @app.exception_handler(AppError)
    async def app_error(_: Request, exc: AppError) -> JSONResponse:
        if exc.kind in (ErrorKind.MISCONFIGURED, ErrorKind.UPSTREAM):
            log.warning("%s: %s", exc.code, exc.message)
        return JSONResponse(error_body(exc.code, exc.message, exc.details), status_code=HTTP_STATUS[exc.kind])

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"path": ".".join(str(part) for part in err["loc"] if part not in ("body", "query", "path")), "message": err["msg"]}
            for err in exc.errors()
        ]
        return JSONResponse(error_body("VALIDATION_ERROR", "Some fields are missing or invalid.", details), status_code=400)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(exc.status_code, "HTTP_ERROR")
        return JSONResponse(error_body(code, str(exc.detail)), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error", exc_info=exc)
        return JSONResponse(error_body("INTERNAL_ERROR", "Something went wrong on our side. Try again."), status_code=500)
