import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, require_csrf
from app.core.errors import AppError
from app.modules.digest import service

# The settings a signed-in user changes from the app.
router = APIRouter(
    prefix="/notifications/email", tags=["notifications"], dependencies=[Depends(require_csrf)]
)
# Reached from outside the app: the unsubscribe link in an email, and the daily scheduler.
# Neither has a session or the CSRF header; each carries its own credential.
public_router = APIRouter(tags=["notifications"])


class EmailSettings(BaseModel):
    enabled: bool
    # False when this server has no email provider set up, so the setting cannot be turned on.
    available: bool


class EmailSettingsIn(BaseModel):
    enabled: bool


@router.get("", response_model=EmailSettings)
def get_email_settings(user: CurrentUser) -> EmailSettings:
    return EmailSettings(enabled=user.email_digest, available=get_settings().email_enabled)


@router.put("", response_model=EmailSettings)
def update_email_settings(body: EmailSettingsIn, user: CurrentUser, db: DbSession) -> EmailSettings:
    available = get_settings().email_enabled
    if body.enabled and not available:
        raise AppError(409, "email_unavailable", "Email is not set up on this server")
    user.email_digest = body.enabled
    db.commit()
    return EmailSettings(enabled=user.email_digest, available=available)


def _unsubscribe(db: DbSession, token: str) -> None:
    user = service.user_for_unsubscribe(db, token)
    user.email_digest = False
    db.commit()


@public_router.get("/notifications/email/unsubscribe", include_in_schema=False)
def unsubscribe_link(
    token: Annotated[str, Query(max_length=1024)], db: DbSession
) -> RedirectResponse:
    """The link in the email: turns the digest off and shows the settings page."""
    origin = get_settings().FRONTEND_ORIGIN
    try:
        _unsubscribe(db, token)
    except AppError:
        return RedirectResponse(f"{origin}/settings?email=invalid-link", status_code=303)
    return RedirectResponse(f"{origin}/settings?email=unsubscribed", status_code=303)


@public_router.post("/notifications/email/unsubscribe", status_code=204, include_in_schema=False)
def unsubscribe_one_click(token: Annotated[str, Query(max_length=1024)], db: DbSession) -> None:
    """RFC 8058 one-click unsubscribe, POSTed by mail apps from the List-Unsubscribe header."""
    _unsubscribe(db, token)


class DigestRun(BaseModel):
    sent: int
    skipped: int
    failed: int


@public_router.post("/internal/digests", response_model=DigestRun, include_in_schema=False)
def run_digests(
    db: DbSession, authorization: Annotated[str | None, Header()] = None
) -> dict[str, int]:
    """Sends today's digests. Called once a day by the scheduler with the CRON_SECRET."""
    settings = get_settings()
    if not settings.CRON_SECRET:
        raise AppError(404, "not_found", "Resource not found")
    expected = f"Bearer {settings.CRON_SECRET}"
    if not hmac.compare_digest((authorization or "").encode(), expected.encode()):
        raise AppError(401, "unauthorized", "Not authenticated")
    if not settings.email_enabled:
        raise AppError(503, "email_unavailable", "Email is not set up on this server")
    return service.send_due_digests(db)
