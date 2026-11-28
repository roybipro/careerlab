import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, Uuid, false
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, str_enum


class InterviewType(enum.StrEnum):
    phone_screen = "phone_screen"
    video = "video"
    onsite = "onsite"
    technical = "technical"
    behavioral = "behavioral"
    case_study = "case_study"
    take_home = "take_home"
    panel = "panel"
    other = "other"


class InterviewOutcome(enum.StrEnum):
    pending = "pending"
    passed = "passed"
    not_passed = "not_passed"
    cancelled = "cancelled"


class JobInterview(TimestampMixin, Base):
    """One interview round of a job application. Deleted with its job (ON DELETE CASCADE)."""

    __tablename__ = "job_interviews"
    __table_args__ = (
        Index("ix_job_interviews_user_job", "user_id", "job_id"),
        Index("ix_job_interviews_user_scheduled", "user_id", "scheduled_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    job_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("job_applications.id", ondelete="CASCADE")
    )
    # What the round is, e.g. "Recruiter screen" or "Round 2: system design".
    title: Mapped[str] = mapped_column(String(200))
    interview_type: Mapped[InterviewType] = mapped_column(
        str_enum(InterviewType, 20),
        default=InterviewType.other,
        server_default=InterviewType.other.value,
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    # A place or a meeting link.
    location: Mapped[str | None] = mapped_column(String(500))
    interviewers: Mapped[str | None] = mapped_column(String(500))
    outcome: Mapped[InterviewOutcome] = mapped_column(
        str_enum(InterviewOutcome, 20),
        default=InterviewOutcome.pending,
        server_default=InterviewOutcome.pending.value,
    )
    # How it went, 1 (badly) to 5 (very well), in the user's own view.
    rating: Mapped[int | None] = mapped_column(Integer)
    questions: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    thank_you_sent: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
