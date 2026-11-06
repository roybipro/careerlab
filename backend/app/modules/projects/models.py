import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, String, Text, Uuid, false
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, str_enum


class ProjectType(enum.StrEnum):
    personal = "personal"
    university_course = "university_course"
    thesis = "thesis"
    research_group = "research_group"
    other = "other"


class ProjectStage(enum.StrEnum):
    idea = "idea"
    literature_review = "literature_review"
    experiments = "experiments"
    writing = "writing"
    submitting = "submitting"
    published = "published"
    paused = "paused"


class VenueType(enum.StrEnum):
    conference = "conference"
    journal = "journal"
    workshop = "workshop"
    other = "other"


class SubmissionStatus(enum.StrEnum):
    planned = "planned"
    submitted = "submitted"
    under_review = "under_review"
    revisions_requested = "revisions_requested"
    accepted = "accepted"
    rejected = "rejected"
    withdrawn = "withdrawn"


# Stages that no longer count towards open work on the dashboard.
INACTIVE_STAGES = (ProjectStage.published, ProjectStage.paused)


class ResearchProject(TimestampMixin, Base):
    __tablename__ = "research_projects"
    __table_args__ = (
        Index("ix_research_projects_user_stage", "user_id", "stage"),
        Index("ix_research_projects_user_created", "user_id", "created_at"),
        Index("ix_research_projects_user_target_date", "user_id", "target_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    project_type: Mapped[ProjectType] = mapped_column(
        str_enum(ProjectType, 30),
        default=ProjectType.personal,
        server_default=ProjectType.personal.value,
    )
    stage: Mapped[ProjectStage] = mapped_column(
        str_enum(ProjectStage, 30),
        default=ProjectStage.idea,
        server_default=ProjectStage.idea.value,
    )
    topic: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    institution: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)
    target_date: Mapped[date | None] = mapped_column(Date)


class ProjectSubmission(TimestampMixin, Base):
    __tablename__ = "project_submissions"
    __table_args__ = (
        Index("ix_project_submissions_user_project", "user_id", "project_id"),
        Index("ix_project_submissions_user_status_paper", "user_id", "status", "paper_deadline"),
        Index(
            "ix_project_submissions_user_status_abstract", "user_id", "status", "abstract_deadline"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("research_projects.id", ondelete="CASCADE")
    )
    venue_name: Mapped[str] = mapped_column(String(200))
    venue_type: Mapped[VenueType] = mapped_column(
        str_enum(VenueType, 20),
        default=VenueType.conference,
        server_default=VenueType.conference.value,
    )
    venue_url: Mapped[str | None] = mapped_column(String(2048))
    abstract_deadline: Mapped[date | None] = mapped_column(Date)
    paper_deadline: Mapped[date | None] = mapped_column(Date)
    notification_date: Mapped[date | None] = mapped_column(Date)
    submitted_on: Mapped[date | None] = mapped_column(Date)
    status: Mapped[SubmissionStatus] = mapped_column(
        str_enum(SubmissionStatus, 30),
        default=SubmissionStatus.planned,
        server_default=SubmissionStatus.planned.value,
    )
    feedback: Mapped[str | None] = mapped_column(Text)


class ProjectMilestone(TimestampMixin, Base):
    __tablename__ = "project_milestones"
    __table_args__ = (
        Index("ix_project_milestones_user_project", "user_id", "project_id"),
        Index("ix_project_milestones_user_done_due", "user_id", "is_done", "due_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("research_projects.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String(200))
    due_date: Mapped[date | None] = mapped_column(Date)
    is_done: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
