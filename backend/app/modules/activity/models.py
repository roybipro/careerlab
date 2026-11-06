import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ActivityLog(Base):
    """Append-only history of changes. Rows are never updated or deleted by the app."""

    __tablename__ = "activity_logs"
    __table_args__ = (
        Index("ix_activity_logs_user_entity", "user_id", "entity_type", "entity_id"),
        Index("ix_activity_logs_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    entity_type: Mapped[str] = mapped_column(String(20))
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    action: Mapped[str] = mapped_column(String(40))
    # `metadata` is reserved on declarative models, so the attribute is `meta`.
    meta: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)
    # clock_timestamp(), not now(): events written in one transaction keep their order.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp()
    )
