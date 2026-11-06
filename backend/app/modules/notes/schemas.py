import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

from app.modules.entity_types import EntityType
from app.modules.notes.models import NoteKind

Content = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50_000)]


class NoteCreate(BaseModel):
    entity_type: EntityType
    entity_id: uuid.UUID
    kind: NoteKind = NoteKind.note
    content: Content


class NoteUpdate(BaseModel):
    """A note stays on the record it was written on, so only kind and content change."""

    kind: NoteKind | None = None
    content: Content | None = None

    @model_validator(mode="after")
    def _fields_cannot_be_null(self) -> "NoteUpdate":
        for field in ("kind", "content"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class NoteFilters(BaseModel):
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None
    kind: NoteKind | None = None


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_type: EntityType
    entity_id: uuid.UUID
    kind: NoteKind
    content: str
    created_at: datetime
    updated_at: datetime
