import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, str_enum


class JobType(enum.StrEnum):
    on_site = "on_site"
    remote = "remote"
    hybrid = "hybrid"


class EmploymentType(enum.StrEnum):
    full_time = "full_time"
    part_time = "part_time"
    internship = "internship"
    contract = "contract"
    temporary = "temporary"
    co_op = "co_op"
    apprenticeship = "apprenticeship"
    freelance = "freelance"
    graduate_program = "graduate_program"


# The "internships" category in the job list.
INTERNSHIP_TYPES = (EmploymentType.internship, EmploymentType.co_op)


class JobSource(enum.StrEnum):
    linkedin = "linkedin"
    company_website = "company_website"
    referral = "referral"
    job_board = "job_board"
    university_career_center = "university_career_center"
    recruiter = "recruiter"
    other = "other"


class PayPeriod(enum.StrEnum):
    hourly = "hourly"
    monthly = "monthly"
    yearly = "yearly"
    stipend = "stipend"
    unpaid = "unpaid"


class VisaSponsorship(enum.StrEnum):
    yes = "yes"
    no = "no"
    unknown = "unknown"


class JobStatus(enum.StrEnum):
    wishlist = "wishlist"
    preparing = "preparing"
    applied = "applied"
    assessment = "assessment"
    interview = "interview"
    offer = "offer"
    rejected = "rejected"
    withdrawn = "withdrawn"


class Priority(enum.StrEnum):
    low = "low"
    medium = "medium"
    high = "high"


class JobApplication(TimestampMixin, Base):
    __tablename__ = "job_applications"
    __table_args__ = (
        CheckConstraint(
            "salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max",
            name="ck_job_applications_salary_range",
        ),
        CheckConstraint(
            "start_date IS NULL OR end_date IS NULL OR start_date <= end_date",
            name="ck_job_applications_date_range",
        ),
        Index("ix_job_applications_user_status", "user_id", "status"),
        Index("ix_job_applications_user_deadline", "user_id", "deadline"),
        Index("ix_job_applications_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    company_name: Mapped[str] = mapped_column(String(200))
    position_title: Mapped[str] = mapped_column(String(200))
    company_website: Mapped[str | None] = mapped_column(String(2048))
    company_logo_url: Mapped[str | None] = mapped_column(String(2048))
    job_url: Mapped[str | None] = mapped_column(String(2048))
    job_description: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)
    job_type: Mapped[JobType | None] = mapped_column(str_enum(JobType))
    employment_type: Mapped[EmploymentType | None] = mapped_column(str_enum(EmploymentType))
    salary_min: Mapped[int | None] = mapped_column(Integer)
    salary_max: Mapped[int | None] = mapped_column(Integer)
    salary_currency: Mapped[str | None] = mapped_column(String(10))
    pay_period: Mapped[PayPeriod | None] = mapped_column(str_enum(PayPeriod))
    source: Mapped[JobSource | None] = mapped_column(str_enum(JobSource, length=30))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    visa_sponsorship: Mapped[VisaSponsorship | None] = mapped_column(str_enum(VisaSponsorship))
    academic_credit: Mapped[bool | None] = mapped_column(Boolean)
    status: Mapped[JobStatus] = mapped_column(
        str_enum(JobStatus), default=JobStatus.wishlist, server_default=JobStatus.wishlist.value
    )
    priority: Mapped[Priority] = mapped_column(
        str_enum(Priority), default=Priority.medium, server_default=Priority.medium.value
    )
    resume_version: Mapped[str | None] = mapped_column(String(500))
    cover_letter_ref: Mapped[str | None] = mapped_column(Text)
    application_date: Mapped[date | None] = mapped_column(Date)
    deadline: Mapped[date | None] = mapped_column(Date)
    follow_up_date: Mapped[date | None] = mapped_column(Date)
    interview_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
