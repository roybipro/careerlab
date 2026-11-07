import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DataError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


def not_found() -> AppError:
    return AppError(404, "not_found", "Resource not found")


def _envelope(status: int, code: str, message: str, details: Any = None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": details}},
    )


_HTTP_CODES = {
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    429: "rate_limited",
}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return _envelope(exc.status, exc.code, exc.message, exc.details)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_CODES.get(exc.status_code, "http_error")
        return _envelope(exc.status_code, code, str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {
                "loc": list(e["loc"]),
                # Pydantic prefixes messages from our own validators with "Value error, ".
                "message": e["msg"].removeprefix("Value error, "),
                "type": e["type"],
            }
            for e in exc.errors()
        ]
        return _envelope(422, "validation_error", "Request validation failed", details)

    @app.exception_handler(DataError)
    async def _data_error(request: Request, exc: DataError) -> JSONResponse:
        # The database refused a value the schemas let through, most often a NUL character
        # (PostgreSQL text cannot hold one). It is the caller's input, not a server fault.
        logger.info("Rejected unstorable input on %s %s: %s", request.method, request.url.path, exc)
        return _envelope(
            422,
            "validation_error",
            "A value contains characters or data the database cannot store",
        )

    @app.exception_handler(Exception)
    async def _unhandled_error(request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled exception on %s %s", request.method, request.url.path, exc_info=exc)
        return _envelope(500, "internal_error", "Internal server error")
