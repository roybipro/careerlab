import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.core.schemas import BoundedDatetime, Name
from app.modules.interviews.models import InterviewOutcome, InterviewType

Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
LongText = Annotated[str, Field(max_length=50_000)]
Minutes = Annotated[int, Field(ge=5, le=1440)]
Rating = Annotated[int, Field(ge=1, le=5)]


class _InterviewFields(BaseModel):
    scheduled_at: BoundedDatetime | None = None
    duration_minutes: Minutes | None = None
    location: Short | None = None
    interviewers: Short | None = None
    rating: Rating | None = None
    questions: LongText | None = None
    notes: LongText | None = None


class InterviewCreate(_InterviewFields):
    title: Name
    interview_type: InterviewType = InterviewType.other
    outcome: InterviewOutcome = InterviewOutcome.pending
    thank_you_sent: bool = False


class InterviewUpdate(_InterviewFields):
    """Only fields present in the body change; an explicit null clears an optional field."""

    title: Name | None = None
    interview_type: InterviewType | None = None
    outcome: InterviewOutcome | None = None
    thank_you_sent: bool | None = None

    @model_validator(mode="after")
    def _required_fields_cannot_be_null(self) -> "InterviewUpdate":
        for field in ("title", "interview_type", "outcome", "thank_you_sent"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class InterviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_id: uuid.UUID
    title: str
    interview_type: InterviewType
    scheduled_at: datetime | None
    duration_minutes: int | None
    location: str | None
    interviewers: str | None
    outcome: InterviewOutcome
    rating: int | None
    questions: str | None
    notes: str | None
    thank_you_sent: bool
    created_at: datetime
    updated_at: datetime
