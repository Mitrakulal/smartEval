import logging
from typing import Any, Dict, Optional, Union
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("smarteval.errors")


class ApiError(Exception):
    """Custom API exception strictly adhering to the API contract error envelope."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        detail: Optional[Union[Dict[str, Any], list]] = None,
    ):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.detail = detail if detail is not None else {}
        super().__init__(message)


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "detail": exc.detail,
            }
        },
    )


async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Validation error in request payload or parameters",
                "detail": exc.errors(),
            }
        },
    )


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    code_map = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        409: "CONFLICT",
        422: "VALIDATION_ERROR",
        500: "INTERNAL",
    }
    code = code_map.get(exc.status_code, "ERROR")
    message = str(exc.detail) if exc.detail else "An HTTP error occurred"
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "detail": {},
            }
        },
    )


async def unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    logger.exception("Unhandled server exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL",
                "message": "Internal server error",
                "detail": {},
            }
        },
    )


def register_error_handlers(app: FastAPI) -> None:
    """Register all global exception handlers on the FastAPI application instance."""
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
