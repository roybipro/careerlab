"""Dashboard numbers, computed with aggregate SQL.

Date-only fields (deadline, follow_up_date, next_follow_up_at) compare against "today".
The API has no user time zone, so the browser sends its local date as `today` (validated by
the route to be within a day of the UTC date); without it, "today" is the UTC date of `now`.
Reminders carry a time, so they compare against the instant `now`.

Every function takes `now` (and `today`) so tests can fix the clock; routes pass only `today`.
"""

from collections.abc import Sequence
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import ColumnElement, Subquery, and_, func, literal, select, union_all
from sqlalchemy.orm import Session

from app.modules.activity.models import ActivityLog
from app.modules.auth.models import User
from app.modules.contacts.models import Contact
from app.modules.entities import job_label, research_label
from app.modules.jobs.models import JobApplication, JobStatus
from app.modules.projects.models import ResearchProject
from app.modules.projects.service import (
    active_project_clause,
    open_milestones,
    planned_submission_deadlines,
)
from app.modules.reminders.models import Reminder
from app.modules.research.models import ResearchOpportunity, ResearchStatus

DEADLINE_WINDOW_DAYS = 14
FOLLOW_UP_WINDOW_DAYS = 7
RECENT_ACTIVITY_LIMIT = 10
MONTHS = 12
OVERDUE_RESEARCH_LIMIT = 50

IN_PROGRESS_JOB_STATUSES = (
    JobStatus.preparing,
    JobStatus.applied,
    JobStatus.assessment,
    JobStatus.interview,
)
INACTIVE_JOB_STATUSES = (JobStatus.offer, JobStatus.rejected, JobStatus.withdrawn)
INACTIVE_RESEARCH_STATUSES = (
    ResearchStatus.accepted,
    ResearchStatus.rejected,
    ResearchStatus.archived,
)


def _utc(now: datetime | None) -> datetime:
    return datetime.now(UTC) if now is None else now.astimezone(UTC)


# The window rules below are shared by the summary count and the deadline list, so the
# card and the list cannot disagree.


def _job_deadline_rule(user: User, today: date) -> list[ColumnElement[bool]]:
    return [
        JobApplication.user_id == user.id,
        JobApplication.status.notin_(INACTIVE_JOB_STATUSES),
        JobApplication.deadline >= today,
        JobApplication.deadline <= today + timedelta(days=DEADLINE_WINDOW_DAYS),
    ]


def _research_deadline_rule(user: User, today: date) -> list[ColumnElement[bool]]:
    return [
        ResearchOpportunity.user_id == user.id,
        ResearchOpportunity.status.notin_(INACTIVE_RESEARCH_STATUSES),
        ResearchOpportunity.deadline >= today,
        ResearchOpportunity.deadline <= today + timedelta(days=DEADLINE_WINDOW_DAYS),
    ]


def _reminder_deadline_rule(user: User, now: datetime) -> list[ColumnElement[bool]]:
    return [
        Reminder.user_id == user.id,
        Reminder.is_completed.is_(False),
        Reminder.due_at >= now,
        Reminder.due_at <= now + timedelta(days=DEADLINE_WINDOW_DAYS),
    ]


def _open_research_items(user: User) -> Subquery:
    """Open research items of every user project, from the rules in projects.service.

    Columns: kind, item_id, title, due, project_id, project_title. A submission's venue
    title gets " abstract" or " paper" so the two dates read as separate items.
    """
    subs = planned_submission_deadlines(user)
    miles = open_milestones(user).subquery("open_milestones")
    title = subs.c.title + literal(" ") + func.replace(subs.c.field, "_deadline", "")
    items = union_all(
        select(
            literal("project_submission_deadline").label("kind"),
            subs.c.item_id,
            title.label("title"),
            subs.c.due,
            subs.c.project_id,
        ),
        select(
            literal("project_milestone").label("kind"),
            miles.c.item_id,
            miles.c.title,
            miles.c.due,
            miles.c.project_id,
        ),
    ).subquery("open_research_items")
    return (
        select(
            items.c.kind,
            items.c.item_id,
            items.c.title,
            items.c.due,
            items.c.project_id,
            ResearchProject.title.label("project_title"),
        )
        .join(ResearchProject, ResearchProject.id == items.c.project_id)
        .subquery("open_research")
    )


def _research_window_rule(items: Subquery, today: date) -> list[ColumnElement[bool]]:
    return [items.c.due >= today, items.c.due <= today + timedelta(days=DEADLINE_WINDOW_DAYS)]


def summary(
    db: Session, user: User, now: datetime | None = None, today: date | None = None
) -> dict[str, int]:
    now = _utc(now)
    today = today or now.date()
    follow_up_by = today + timedelta(days=FOLLOW_UP_WINDOW_DAYS)

    job_row = db.execute(
        select(
            func.count().label("total"),
            func.count().filter(JobApplication.status.in_(IN_PROGRESS_JOB_STATUSES)).label("busy"),
            func.count().filter(JobApplication.interview_at > now).label("interviews"),
            func.count().filter(JobApplication.status == JobStatus.offer).label("offers"),
            func.count().filter(JobApplication.status == JobStatus.rejected).label("rejected"),
            func.count().filter(and_(*_job_deadline_rule(user, today))).label("deadlines"),
            # A job that is already offer, rejected or withdrawn needs no follow-up.
            func.count()
            .filter(
                JobApplication.status.notin_(INACTIVE_JOB_STATUSES),
                JobApplication.follow_up_date <= follow_up_by,
            )
            .label("follow_ups"),
        ).where(JobApplication.user_id == user.id)
    ).one()

    research_row = db.execute(
        select(
            func.count().label("total"),
            func.count().filter(ResearchOpportunity.status == ResearchStatus.accepted).label("won"),
            func.count()
            .filter(ResearchOpportunity.status == ResearchStatus.rejected)
            .label("rejected"),
            func.count().filter(and_(*_research_deadline_rule(user, today))).label("deadlines"),
        ).where(ResearchOpportunity.user_id == user.id)
    ).one()

    open_items = _open_research_items(user)
    project_deadlines = db.scalar(
        select(func.count())
        .select_from(open_items)
        .where(*_research_window_rule(open_items, today))
    )
    active_projects = db.scalar(
        select(func.count())
        .select_from(ResearchProject)
        .where(ResearchProject.user_id == user.id, active_project_clause())
    )
    reminder_deadlines = db.scalar(
        select(func.count()).select_from(Reminder).where(*_reminder_deadline_rule(user, now))
    )
    contact_follow_ups = db.scalar(
        select(func.count())
        .select_from(Contact)
        .where(Contact.user_id == user.id, Contact.next_follow_up_at <= follow_up_by)
    )

    return {
        "total_jobs": job_row.total,
        "total_research": research_row.total,
        "in_progress": job_row.busy,
        "interviews_scheduled": job_row.interviews,
        "offers": job_row.offers + research_row.won,
        "rejected": job_row.rejected + research_row.rejected,
        "upcoming_deadlines": job_row.deadlines
        + research_row.deadlines
        + (project_deadlines or 0)
        + (reminder_deadlines or 0),
        "pending_follow_ups": job_row.follow_ups + (contact_follow_ups or 0),
        "active_research_projects": active_projects or 0,
    }


def _sort_instant(due: date | datetime) -> datetime:
    if isinstance(due, datetime):
        return due
    return datetime.combine(due, time.min, tzinfo=UTC)


def _research_item(row: Any, related: bool) -> dict[str, Any]:
    item: dict[str, Any] = {
        "kind": row.kind,
        "id": row.item_id,
        "title": row.title,
        "due": row.due,
        "project_id": row.project_id,
        "project_title": row.project_title,
    }
    if related:
        item.update(related_type="project", related_id=row.project_id)
    return item


def overdue_research(
    db: Session, user: User, now: datetime | None = None, today: date | None = None
) -> list[dict[str, Any]]:
    """Open research items dated before today, oldest first. An item due today is not overdue."""
    today = today or _utc(now).date()
    items = _open_research_items(user)
    rows = db.execute(
        select(items)
        .where(items.c.due < today)
        .order_by(items.c.due, items.c.kind, items.c.item_id)
        .limit(OVERDUE_RESEARCH_LIMIT)
    )
    return [_research_item(row, related=False) for row in rows]


def upcoming_deadlines(
    db: Session, user: User, now: datetime | None = None, today: date | None = None
) -> list[dict[str, Any]]:
    now = _utc(now)
    today = today or now.date()
    items: list[dict[str, Any]] = []

    for job in db.scalars(select(JobApplication).where(*_job_deadline_rule(user, today))):
        items.append(
            {
                "kind": "job_deadline",
                "id": job.id,
                "title": job_label(job),
                "due": job.deadline,
                "related_type": "job",
                "related_id": job.id,
            }
        )
    for item in db.scalars(
        select(ResearchOpportunity).where(*_research_deadline_rule(user, today))
    ):
        items.append(
            {
                "kind": "research_deadline",
                "id": item.id,
                "title": research_label(item),
                "due": item.deadline,
                "related_type": "research",
                "related_id": item.id,
            }
        )
    open_items = _open_research_items(user)
    for row in db.execute(select(open_items).where(*_research_window_rule(open_items, today))):
        items.append(_research_item(row, related=True))
    for reminder in db.scalars(select(Reminder).where(*_reminder_deadline_rule(user, now))):
        items.append(
            {
                "kind": "reminder",
                "id": reminder.id,
                "title": reminder.title,
                "due": reminder.due_at,
                "related_type": reminder.related_type,
                "related_id": reminder.related_id,
            }
        )

    items.sort(key=lambda i: (_sort_instant(i["due"]), i["kind"], str(i["id"])))
    return items


def recent_activities(db: Session, user: User) -> Sequence[ActivityLog]:
    return db.scalars(
        select(ActivityLog)
        .where(ActivityLog.user_id == user.id)
        .order_by(ActivityLog.created_at.desc(), ActivityLog.id)
        .limit(RECENT_ACTIVITY_LIMIT)
    ).all()


def _status_counts(
    db: Session, status_column: Any, user_column: Any, user: User, statuses: Any
) -> list[dict[str, Any]]:
    """Counts for every status in enum order, so a chart gets a stable list with zeros."""
    rows = db.execute(
        select(status_column, func.count()).where(user_column == user.id).group_by(status_column)
    ).all()
    counts = {status.value: count for status, count in rows}
    return [{"status": s.value, "count": counts.get(s.value, 0)} for s in statuses]


def _month_starts(today: date) -> list[date]:
    """The first day of each of the last 12 months, oldest first, ending this month."""
    index = today.year * 12 + today.month - 1
    return [date((i // 12), (i % 12) + 1, 1) for i in range(index - MONTHS + 1, index + 1)]


def _monthly_counts(db: Session, model: Any, user: User, first: date, end: date) -> dict[str, int]:
    month = func.to_char(model.application_date, "YYYY-MM")
    rows = db.execute(
        select(month, func.count())
        .where(
            model.user_id == user.id,
            model.application_date >= first,
            model.application_date < end,
        )
        .group_by(month)
    ).all()
    return {m: count for m, count in rows}


def analytics(db: Session, user: User, now: datetime | None = None) -> dict[str, Any]:
    today = _utc(now).date()
    starts = _month_starts(today)
    end = (starts[-1] + timedelta(days=32)).replace(day=1)
    jobs = _monthly_counts(db, JobApplication, user, starts[0], end)
    research = _monthly_counts(db, ResearchOpportunity, user, starts[0], end)
    labels = [s.strftime("%Y-%m") for s in starts]
    return {
        "job_status": _status_counts(
            db, JobApplication.status, JobApplication.user_id, user, JobStatus
        ),
        "research_status": _status_counts(
            db, ResearchOpportunity.status, ResearchOpportunity.user_id, user, ResearchStatus
        ),
        "monthly": [
            {"month": m, "jobs": jobs.get(m, 0), "research": research.get(m, 0)} for m in labels
        ],
    }
