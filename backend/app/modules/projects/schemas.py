import uuid
from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.schemas import Name
from app.modules.projects.models import ProjectStage, ProjectType

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
