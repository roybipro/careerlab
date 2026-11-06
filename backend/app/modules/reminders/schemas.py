import enum
import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.schemas import BoundedDatetime, Name
from app.modules.entity_types import EntityType

Description = Annotated[str, Field(max_length=50_000)]


class ReminderState(enum.StrEnum):
    overdue = "overdue"
    upcoming = "upcoming"
    completed = "completed"


class ReminderCreate(BaseModel):
    title: Name
    description: Description | None = None
    due_at: BoundedDatetime
    related_type: EntityType | None = None
    related_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _related_is_a_pair(self) -> "ReminderCreate":
        if (self.related_type is None) != (self.related_id is None):
            raise ValueError("related_type and related_id must be sent together")
        return self


class ReminderUpdate(BaseModel):
    """Only fields present in the body change; an explicit null clears an optional field."""

    title: Name | None = None
    description: Description | None = None
    due_at: BoundedDatetime | None = None
    related_type: EntityType | None = None
    related_id: uuid.UUID | None = None
    is_completed: bool | None = None

    @model_validator(mode="after")
    def _required_fields_cannot_be_null(self) -> "ReminderUpdate":
        for field in ("title", "due_at", "is_completed"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class ReminderFilters(BaseModel):
    state: ReminderState | None = None
    related_type: EntityType | None = None
    related_id: uuid.UUID | None = None
    # Incomplete reminders that are overdue or due within this many days (the header bell).
    due_within_days: Annotated[int, Field(ge=0, le=365)] | None = None


class ReminderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    due_at: datetime
    related_type: EntityType | None
    related_id: uuid.UUID | None
    is_completed: bool
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
