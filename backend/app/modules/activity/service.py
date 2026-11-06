import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.lists import ListParams, Page, paginate
from app.modules.activity.models import ActivityLog
from app.modules.auth.models import User

SORT_FIELDS = {"created_at": ActivityLog.created_at}


def log_activity(
    db: Session,
    user: User,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    label: str,
    **meta: Any,
) -> None:
    """Write an activity row in the caller's transaction. The caller commits.

    Flushing here gives each event its own INSERT, so events written in one request
    get distinct, correctly ordered created_at values.
    """
    db.add(
        ActivityLog(
            user_id=user.id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            meta={"label": label, **meta},
        )
    )
    db.flush()


def list_activity(
    db: Session,
    user: User,
    params: ListParams,
    entity_type: str | None,
    entity_id: uuid.UUID | None,
) -> Page[Any]:
    stmt = select(ActivityLog).where(ActivityLog.user_id == user.id)
    if entity_type is not None:
        stmt = stmt.where(ActivityLog.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(ActivityLog.entity_id == entity_id)
    return paginate(db, stmt, params, SORT_FIELDS, "-created_at")
