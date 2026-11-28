from typing import Annotated

from fastapi import APIRouter, Depends, Path, Response
from pydantic import BaseModel

from app.core.deps import CurrentUser, DbSession, require_csrf
from app.core.rate_limit import RateLimiter
from app.modules.calendar import service

router = APIRouter(prefix="/calendar", tags=["calendar"])

# Calendar apps poll on their own schedule (Google every few hours, Apple as often as every
# few minutes); this only stops one link being hammered.
_feed_limiter = RateLimiter(limit=60, window_seconds=3600)

FEED_PATH = "/api/v1/calendar/{token}.ics"


class FeedStatus(BaseModel):
    enabled: bool


class FeedCreated(BaseModel):
    enabled: bool = True
    # Relative to the site: the frontend serves /api/v1 from its own origin.
    path: str


@router.get("/feed", response_model=FeedStatus, dependencies=[Depends(require_csrf)])
def feed_status(user: CurrentUser) -> FeedStatus:
    return FeedStatus(enabled=user.calendar_token_hash is not None)


@router.post("/feed", response_model=FeedCreated, dependencies=[Depends(require_csrf)])
def create_feed(user: CurrentUser, db: DbSession) -> FeedCreated:
    """Turns the feed on, or replaces its link (the old one stops working). Shown once."""
    token = service.create_feed_token(db, user)
    return FeedCreated(path=FEED_PATH.format(token=token))


@router.delete("/feed", status_code=204, dependencies=[Depends(require_csrf)])
def disable_feed(user: CurrentUser, db: DbSession) -> None:
    service.disable_feed(db, user)


@router.get("/{token}.ics", response_class=Response)
def feed(token: Annotated[str, Path(max_length=128)], db: DbSession) -> Response:
    """The feed itself. No session: the secret in the link is the credential."""
    user = service.user_for_token(db, token)
    # Counted per user, after the lookup, so made-up links cannot crowd out real ones.
    _feed_limiter.check(str(user.id))
    return Response(
        service.render_ics(service.collect_events(db, user)),
        media_type="text/calendar; charset=utf-8",
        headers={
            "Cache-Control": "private, max-age=300",
            "Content-Disposition": 'inline; filename="careerlab.ics"',
            # The link is a secret: keep it out of search engines.
            "X-Robots-Tag": "noindex",
        },
    )
