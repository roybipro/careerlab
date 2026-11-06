import uuid
from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.schemas import HttpUrl, Name
from app.modules.projects.models import (
    ProjectStage,
    ProjectType,
    SubmissionStatus,
    VenueType,
)

Text = Annotated[str, Field(max_length=50_000)]
ShortText = Annotated[str, Field(max_length=200)]


class _ProjectFields(BaseModel):
    """Optional fields shared by create and update."""

    topic: ShortText | None = None
    description: Text | None = None
    institution: ShortText | None = None
    notes: Text | None = None
    target_date: date | None = None


class ProjectCreate(_ProjectFields):
    title: Name
    project_type: ProjectType = ProjectType.personal
    stage: ProjectStage = ProjectStage.idea


class ProjectUpdate(_ProjectFields):
    """Only fields present in the body change; an explicit null clears an optional field."""

    title: Name | None = None
    project_type: ProjectType | None = None
    stage: ProjectStage | None = None

    @model_validator(mode="after")
    def _required_fields_cannot_be_null(self) -> "ProjectUpdate":
        for field in ("title", "project_type", "stage"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class ProjectFilters(BaseModel):
    stage: ProjectStage | None = None
    project_type: ProjectType | None = None
    active: bool | None = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    project_type: ProjectType
    stage: ProjectStage
    topic: str | None
    description: str | None
    institution: str | None
    notes: str | None
    target_date: date | None
    milestones_total: int = 0
    milestones_done: int = 0
    submissions_total: int = 0
    next_deadline: date | None = None
    created_at: datetime
    updated_at: datetime


class _SubmissionFields(BaseModel):
    """Optional fields shared by create and update."""

    venue_url: HttpUrl | None = None
    abstract_deadline: date | None = None
    paper_deadline: date | None = None
    notification_date: date | None = None
    submitted_on: date | None = None
    feedback: Text | None = None


class SubmissionCreate(_SubmissionFields):
    venue_name: Name
    venue_type: VenueType = VenueType.conference
    status: SubmissionStatus = SubmissionStatus.planned

    @model_validator(mode="after")
    def _deadline_order(self) -> "SubmissionCreate":
        if (
            self.abstract_deadline is not None
            and self.paper_deadline is not None
            and self.abstract_deadline > self.paper_deadline
        ):
            raise ValueError("abstract_deadline must not be after paper_deadline")
        return self


class SubmissionUpdate(_SubmissionFields):
    """Only fields present in the body change; an explicit null clears an optional field.

    The deadline order is checked in the service, against the stored values.
    """

    venue_name: Name | None = None
    venue_type: VenueType | None = None
    status: SubmissionStatus | None = None

    @model_validator(mode="after")
    def _required_fields_cannot_be_null(self) -> "SubmissionUpdate":
        for field in ("venue_name", "venue_type", "status"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    venue_name: str
    venue_type: VenueType
    venue_url: str | None
    abstract_deadline: date | None
    paper_deadline: date | None
    notification_date: date | None
    submitted_on: date | None
    status: SubmissionStatus
    feedback: str | None
    created_at: datetime
    updated_at: datetime


class MilestoneCreate(BaseModel):
    title: Name
    due_date: date | None = None
    is_done: bool = False


class MilestoneUpdate(BaseModel):
    """Only fields present in the body change; an explicit null clears `due_date`."""

    title: Name | None = None
    due_date: date | None = None
    is_done: bool | None = None

    @model_validator(mode="after")
    def _required_fields_cannot_be_null(self) -> "MilestoneUpdate":
        for field in ("title", "is_done"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class MilestoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    due_date: date | None
    is_done: bool
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
