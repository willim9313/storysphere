"""API error shape (docs/spec/04 §1.2): every error body is ``{detail, code}``."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    """An error the client is told about. ``extra`` 的 key 併進回應 body（例如 409 的 jobId）。"""

    def __init__(self, status: int, code: str, detail: str, **extra: Any) -> None:
        super().__init__(detail)
        self.status = status
        self.code = code
        self.detail = detail
        self.extra = extra


def not_found(what: str, ident: str) -> ApiError:
    return ApiError(404, "not_found", f"{what} '{ident}' not found.")


def validation_error(detail: str, code: str = "validation_error") -> ApiError:
    return ApiError(422, code, detail)


# 沒有對應 code 的 HTTP 狀態（405、413…）用這張表；查不到就用 "http_error"。
_STATUS_CODES = {404: "not_found", 422: "validation_error"}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status, content={"detail": exc.detail, "code": exc.code, **exc.extra}
        )

    @app.exception_handler(RequestValidationError)
    async def _request_validation(_request: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(part) for part in first.get("loc", ()))
        detail = f"{where}: {first.get('msg', 'invalid request')}" if where else "invalid request"
        return JSONResponse(status_code=422, content={"detail": detail, "code": "validation_error"})

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _STATUS_CODES.get(exc.status_code, "http_error")
        return JSONResponse(
            status_code=exc.status_code, content={"detail": str(exc.detail), "code": code}
        )
