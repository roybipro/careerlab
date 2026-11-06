import uuid
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AppError
from app.core.security import COOKIE_NAME, decode_token
from app.modules.auth.models import User

_UNSAFE_METHODS = {"POST", "PATCH", "DELETE", "PUT"}


def require_csrf(request: Request) -> None:
    if request.method in _UNSAFE_METHODS and request.headers.get("x-requested-with") != "CareerLab":
        raise AppError(403, "forbidden", "Missing X-Requested-With header")


def current_user(request: Request, db: Annotated[Session, Depends(get_db)]) -> User:
    unauthorized = AppError(401, "unauthorized", "Not authenticated")
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise unauthorized
    payload = decode_token(token)
    try:
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, TypeError):
        raise unauthorized from None
    user = db.get(User, user_id)
    if user is None or user.token_version != payload["ver"]:
        raise unauthorized
    return user


DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]
