import uuid
from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.deps import ClientToday, CurrentUser, DbSession, require_csrf
from app.modules.nudges import service

router = APIRouter(prefix="/nudges", tags=["nudges"], dependencies=[Depends(require_csrf)])


class NudgeOut(BaseModel):
    kind: Literal["job", "research", "contact"]
    id: uuid.UUID
    title: str
    # no_reply: waiting on an application; quiet_contact: a contact not reached in a while.
    reason: Literal["no_reply", "quiet_contact"]
    since: date
    days: int


class SnoozeIn(BaseModel):
    entity_type: Literal["job", "research", "contact"]
    entity_id: uuid.UUID
    days: Annotated[int, Field(ge=1, le=90)] = 7


@router.get("", response_model=list[NudgeOut])
def list_nudges(user: CurrentUser, db: DbSession, today: ClientToday) -> list[dict[str, object]]:
    return [{**n, "since": n["since"].isoformat()} for n in service.list_nudges(db, user, today)]


@router.post("/snooze", status_code=204)
def snooze(body: SnoozeIn, user: CurrentUser, db: DbSession, today: ClientToday) -> None:
    service.snooze(db, user, body.entity_type, body.entity_id, today + timedelta(days=body.days))
