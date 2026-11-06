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


class DeadlineOut(BaseModel):
    kind: Literal["job_deadline", "research_deadline", "reminder"]
    id: uuid.UUID
    title: str
    # A date for job and research deadlines, a timestamp for reminders.
    due: date | datetime
    related_type: Literal["job", "research", "project", "contact"] | None
    related_id: uuid.UUID | None


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
