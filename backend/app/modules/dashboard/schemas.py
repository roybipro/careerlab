import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


class SummaryOut(BaseModel):
    total_jobs: int
    total_research: int
    in_progress: int
    interviews_scheduled: int
    offers: int
    rejected: int
    upcoming_deadlines: int
    pending_follow_ups: int
    active_research_projects: int


class DeadlineOut(BaseModel):
    kind: Literal[
        "job_deadline",
        "research_deadline",
        "reminder",
        "project_submission_deadline",
        "project_milestone",
    ]
    id: uuid.UUID
    title: str
    # A date for job and research deadlines, a timestamp for reminders.
    due: date | datetime
    related_type: Literal["job", "research", "project", "contact"] | None
    related_id: uuid.UUID | None
    # Set for the two research project kinds only.
    project_id: uuid.UUID | None = None
    project_title: str | None = None


class OverdueResearchOut(BaseModel):
    kind: Literal["project_submission_deadline", "project_milestone"]
    id: uuid.UUID
    title: str
    due: date
    project_id: uuid.UUID
    project_title: str


class StatusCount(BaseModel):
    status: str
    count: int


class MonthlyCount(BaseModel):
    month: str  # YYYY-MM
    jobs: int
    research: int


class AnalyticsOut(BaseModel):
    job_status: list[StatusCount]
    research_status: list[StatusCount]
    monthly: list[MonthlyCount]
