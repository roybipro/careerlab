import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, str_enum
from app.modules.entity_types import EntityType


class Reminder(TimestampMixin, Base):
    __tablename__ = "reminders"
    __table_args__ = (
        CheckConstraint(
            "(related_type IS NULL) = (related_id IS NULL)", name="ck_reminders_related_pair"
        ),
        Index("ix_reminders_user_due", "user_id", "due_at", "is_completed"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    related_type: Mapped[EntityType | None] = mapped_column(str_enum(EntityType))
    related_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
