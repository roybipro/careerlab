import uuid
from datetime import date, datetime
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)

from app.core.schemas import BoundedDatetime, HttpUrl, Name
from app.modules.jobs.models import EmploymentType, JobStatus, JobType, Priority

Salary = Annotated[int, Field(ge=0, le=2_000_000_000)]


class _JobFields(BaseModel):
    """Optional fields shared by create and update."""

    company_website: HttpUrl | None = None
    company_logo_url: HttpUrl | None = None
    job_url: HttpUrl | None = None
    job_description: Annotated[str, Field(max_length=50_000)] | None = None
    location: Annotated[str, Field(max_length=200)] | None = None
    notes: Annotated[str, Field(max_length=50_000)] | None = None
    job_type: JobType | None = None
    employment_type: EmploymentType | None = None
    salary_min: Salary | None = None
    salary_max: Salary | None = None
    salary_currency: Annotated[str, Field(max_length=10)] | None = None
    resume_version: Annotated[str, Field(max_length=500)] | None = None
    cover_letter_ref: Annotated[str, Field(max_length=50_000)] | None = None
    application_date: date | None = None
    deadline: date | None = None
    follow_up_date: date | None = None
    interview_at: BoundedDatetime | None = None


class JobCreate(_JobFields):
    company_name: Name
    position_title: Name
    status: JobStatus = JobStatus.wishlist
    priority: Priority = Priority.medium


class JobUpdate(_JobFields):
    """Only fields present in the body change; an explicit null clears an optional field."""

    company_name: Name | None = None
    position_title: Name | None = None
    status: JobStatus | None = None
    priority: Priority | None = None

    @model_validator(mode="after")
    def _required_fields_cannot_be_null(self) -> "JobUpdate":
        for field in ("company_name", "position_title", "status", "priority"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_name: str
    position_title: str
    company_website: str | None
    company_logo_url: str | None
    job_url: str | None
    job_description: str | None
    location: str | None
    notes: str | None
    job_type: JobType | None
    employment_type: EmploymentType | None
    salary_min: int | None
    salary_max: int | None
    salary_currency: str | None
    status: JobStatus
    priority: Priority
    resume_version: str | None
    cover_letter_ref: str | None
    application_date: date | None
    deadline: date | None
    follow_up_date: date | None
    interview_at: datetime | None
    created_at: datetime
    updated_at: datetime


class JobFilters(BaseModel):
    company: str | None = None
    position: str | None = None
    status: JobStatus | None = None
    priority: Priority | None = None
    job_type: JobType | None = None
    application_date_from: date | None = None
    application_date_to: date | None = None
    deadline_from: date | None = None
    deadline_to: date | None = None
