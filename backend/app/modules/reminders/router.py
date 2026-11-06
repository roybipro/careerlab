import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import CurrentUser, DbSession, require_csrf
from app.core.lists import ListQuery, Page
from app.modules.reminders import service
from app.modules.reminders.models import Reminder
from app.modules.reminders.schemas import (
    ReminderCreate,
    ReminderFilters,
    ReminderOut,
    ReminderUpdate,
)

router = APIRouter(prefix="/reminders", tags=["reminders"], dependencies=[Depends(require_csrf)])


@router.get("", response_model=Page[ReminderOut])
def list_reminders(
    params: ListQuery,
    filters: Annotated[ReminderFilters, Query()],
    user: CurrentUser,
    db: DbSession,
) -> Page[ReminderOut]:
    return service.list_reminders(db, user, params, filters)


@router.post("", status_code=201, response_model=ReminderOut)
def create_reminder(body: ReminderCreate, user: CurrentUser, db: DbSession) -> Reminder:
    return service.create_reminder(db, user, body)


@router.patch("/{reminder_id}", response_model=ReminderOut)
def update_reminder(
    reminder_id: uuid.UUID, body: ReminderUpdate, user: CurrentUser, db: DbSession
) -> Reminder:
    return service.update_reminder(db, user, reminder_id, body)


@router.delete("/{reminder_id}", status_code=204)
def delete_reminder(reminder_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    service.delete_reminder(db, user, reminder_id)
