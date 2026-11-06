import enum
import uuid

from sqlalchemy import ForeignKey, Index, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, str_enum
from app.modules.entity_types import EntityType


class NoteKind(enum.StrEnum):
    note = "note"
    interview_feedback = "interview_feedback"
    communication = "communication"


class Note(TimestampMixin, Base):
    __tablename__ = "notes"
    __table_args__ = (Index("ix_notes_user_entity", "user_id", "entity_type", "entity_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    entity_type: Mapped[EntityType] = mapped_column(str_enum(EntityType))
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    kind: Mapped[NoteKind] = mapped_column(
        str_enum(NoteKind, 30), default=NoteKind.note, server_default=NoteKind.note.value
    )
    content: Mapped[str] = mapped_column(Text)
