"""Bulk changes: one request changes or deletes several of a user's records, all or nothing.

Each record goes through the same service function a single change uses (so validation and
activity logging match), with the commit held back until every record has succeeded. If any
id is missing or belongs to someone else, the request fails with that record's 404 and
nothing is saved.
"""

import uuid
from collections.abc import Callable
from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, Field, model_validator
from sqlalchemy.orm import Session

MAX_BULK_IDS = 100


def _unique(ids: list[uuid.UUID]) -> list[uuid.UUID]:
    # Order kept, repeats dropped, so a record is changed (and logged) once.
    return list(dict.fromkeys(ids))


BulkIds = Annotated[
    list[uuid.UUID], Field(min_length=1, max_length=MAX_BULK_IDS), AfterValidator(_unique)
]


class BulkUpdateIn[ChangesT: BaseModel](BaseModel):
    ids: BulkIds
    changes: ChangesT

    @model_validator(mode="after")
    def _changes_not_empty(self) -> "BulkUpdateIn[ChangesT]":
        if not self.changes.model_fields_set:
            raise ValueError("changes must set at least one field")
        return self


class BulkDeleteIn(BaseModel):
    ids: BulkIds


def apply_all(db: Session, ids: list[uuid.UUID], apply: Callable[[uuid.UUID], Any]) -> None:
    """Runs `apply` (which must not commit) for every id, then commits once."""
    try:
        for record_id in ids:
            apply(record_id)
        db.commit()
    except Exception:
        db.rollback()
        raise
