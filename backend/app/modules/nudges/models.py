import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin


class NudgeSnooze(TimestampMixin, Base):
    """Hides one record's nudge until a day. One row per record: snoozing again moves the day."""

    __tablename__ = "nudge_snoozes"
    __table_args__ = (
        UniqueConstraint("user_id", "entity_type", "entity_id", name="uq_nudge_snoozes_entity"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    # job, research or contact (see entity_types.EntityType); checked in the migration.
    entity_type: Mapped[str] = mapped_column(String(20))
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    # The nudge shows again from this day.
    until: Mapped[date] = mapped_column(Date)
