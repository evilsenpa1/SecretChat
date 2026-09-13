from fastapi import Request, status
from fastapi.responses import JSONResponse

from .shared.exceptions import (
    AppError,
    AppPermissionError,
    IntegrityError,
    NotFoundError,
    ValidationError,
)

EXC_MAP: dict[type[Exception], int] = {
    NotFoundError: status.HTTP_404_NOT_FOUND,
    AppPermissionError: status.HTTP_403_FORBIDDEN,
    ValidationError: status.HTTP_400_BAD_REQUEST,
    IntegrityError: status.HTTP_409_CONFLICT,
}


def _resolve_status(exc: AppError) -> int:
    for exc_type, status_code in EXC_MAP.items():
        if isinstance(exc, exc_type):
            return status_code
    return status.HTTP_400_BAD_REQUEST


async def domain_error_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, AppError):
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": "Internal error"}
        )
    return JSONResponse(status_code=_resolve_status(exc), content={"detail": str(exc)})
