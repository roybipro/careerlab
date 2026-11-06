import uuid
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import Depends, Query, Request
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


def client_today(
    today: Annotated[
        date | None,
        Query(description="The client's local date (YYYY-MM-DD), within one day of the UTC date."),
    ] = None,
) -> date:
    """The date that date-only fields are compared against.

    The API has no user time zone, so the browser sends its local date. Every real
    time zone's date is within one day of the UTC date, so anything further off is
    rejected. Omitted means the UTC date. Reminders still compare instants.
    """
    utc_today = datetime.now(UTC).date()
    if today is None:
        return utc_today
    if abs((today - utc_today).days) > 1:
        raise AppError(
            422,
            "validation_error",
            "today must be within one day of the UTC date",
            [
                {
                    "loc": ["query", "today"],
                    "message": "today must be within one day of the UTC date",
                    "type": "value_error",
                }
            ],
        )
    return today


DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]
ClientToday = Annotated[date, Depends(client_today)]
