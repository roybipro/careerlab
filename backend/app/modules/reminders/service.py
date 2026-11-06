import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.core.lists import ListParams, Page, contains, paginate
from app.modules.auth.models import User
from app.modules.entities import assert_entity_owned
from app.modules.reminders.models import Reminder
from app.modules.reminders.schemas import (
    ReminderCreate,
    ReminderFilters,
    ReminderState,
    ReminderUpdate,
)

SORT_FIELDS = {
    "due_at": Reminder.due_at,
    "created_at": Reminder.created_at,
    "completed_at": Reminder.completed_at,
    "title": Reminder.title,
}


def list_reminders(
    db: Session, user: User, params: ListParams, filters: ReminderFilters
) -> Page[Any]:
    now = datetime.now(UTC)
    stmt = select(Reminder).where(Reminder.user_id == user.id)
    if params.q:
        stmt = stmt.where(
            contains(Reminder.title, params.q) | contains(Reminder.description, params.q)
        )
    # A reminder due right now is upcoming, not overdue.
    if filters.state == ReminderState.overdue:
        stmt = stmt.where(Reminder.is_completed.is_(False), Reminder.due_at < now)
    elif filters.state == ReminderState.upcoming:
        stmt = stmt.where(Reminder.is_completed.is_(False), Reminder.due_at >= now)
    elif filters.state == ReminderState.completed:
        stmt = stmt.where(Reminder.is_completed.is_(True))
    if filters.related_type:
        stmt = stmt.where(Reminder.related_type == filters.related_type)
    if filters.related_id:
        stmt = stmt.where(Reminder.related_id == filters.related_id)
    if filters.due_within_days is not None:
        stmt = stmt.where(
            Reminder.is_completed.is_(False),
            Reminder.due_at <= now + timedelta(days=filters.due_within_days),
        )
    return paginate(db, stmt, params, SORT_FIELDS, "due_at")


def _get_reminder(db: Session, user: User, reminder_id: uuid.UUID) -> Reminder:
    reminder = db.scalar(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == user.id)
    )
    if reminder is None:
        raise not_found()
    return reminder


def create_reminder(db: Session, user: User, data: ReminderCreate) -> Reminder:
    if data.related_type is not None and data.related_id is not None:
        assert_entity_owned(db, user, data.related_type, data.related_id)
    reminder = Reminder(user_id=user.id, **data.model_dump())
    db.add(reminder)
    db.commit()
    return reminder


def update_reminder(
    db: Session, user: User, reminder_id: uuid.UUID, data: ReminderUpdate
) -> Reminder:
    reminder = _get_reminder(db, user, reminder_id)
    changes = data.model_dump(exclude_unset=True)

    related_type = changes.get("related_type", reminder.related_type)
    related_id = changes.get("related_id", reminder.related_id)
    if (related_type is None) != (related_id is None):
        raise AppError(
            422,
            "validation_error",
            "related_type and related_id must be sent together",
            [
                {
                    "loc": ["body", "related_id"],
                    "message": "related_type and related_id must be sent together",
                    "type": "value_error",
                }
            ],
        )
    changed = (related_type, related_id) != (reminder.related_type, reminder.related_id)
    if changed and related_type is not None and related_id is not None:
        assert_entity_owned(db, user, related_type, related_id)

    if "is_completed" in changes and changes["is_completed"] != reminder.is_completed:
        reminder.completed_at = datetime.now(UTC) if changes["is_completed"] else None
    for field, value in changes.items():
        setattr(reminder, field, value)
    db.commit()
    return reminder


def delete_reminder(db: Session, user: User, reminder_id: uuid.UUID) -> None:
    db.delete(_get_reminder(db, user, reminder_id))
    db.commit()
