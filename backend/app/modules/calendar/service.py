"""A private calendar feed (iCalendar, RFC 5545) of a user's deadlines, interviews and reminders.

Calendar apps (Google, Apple, Outlook) subscribe to a URL and fetch it on their own schedule,
without the session cookie, so the URL itself carries a random secret. Only a SHA-256 of that
secret is stored: the link is shown once when it is made, and resetting it makes a new one and
stops the old one working.

Only open work is listed: jobs and research opportunities that are still active, research
projects that are not published or paused, submissions still being prepared, milestones not
done and reminders not completed. Anything dated more than PAST_DAYS ago is left out so the
feed stays small.
"""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.modules.auth.models import User
from app.modules.dashboard.service import INACTIVE_JOB_STATUSES, INACTIVE_RESEARCH_STATUSES
from app.modules.jobs.models import JobApplication
from app.modules.projects.models import (
    INACTIVE_STAGES,
    ProjectMilestone,
    ProjectSubmission,
    ResearchProject,
    SubmissionStatus,
)
from app.modules.reminders.models import Reminder
from app.modules.research.models import ResearchOpportunity

PAST_DAYS = 90
INTERVIEW_LENGTH = timedelta(hours=1)
REMINDER_LENGTH = timedelta(minutes=30)
# Submissions whose deadlines still matter: not sent yet, or sent back for changes.
OPEN_SUBMISSION_STATUSES = (SubmissionStatus.planned, SubmissionStatus.revisions_requested)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_feed_token(db: Session, user: User) -> str:
    """Makes a new feed secret (replacing any old one) and returns it. It is not stored."""
    token = secrets.token_urlsafe(32)
    user.calendar_token_hash = _hash(token)
    db.commit()
    return token


def disable_feed(db: Session, user: User) -> None:
    user.calendar_token_hash = None
    db.commit()


def user_for_token(db: Session, token: str) -> User:
    # Unknown, reset and malformed tokens all look the same: not found.
    user = db.scalar(select(User).where(User.calendar_token_hash == _hash(token)))
    if user is None:
        raise not_found()
    return user


@dataclass(frozen=True)
class Event:
    uid: str
    summary: str
    # A date for an all-day event, or the start of a timed one.
    start: date | datetime
    length: timedelta | None = None
    description: str | None = None


def collect_events(db: Session, user: User, now: datetime | None = None) -> list[Event]:
    now = datetime.now(UTC) if now is None else now.astimezone(UTC)
    since_day = now.date() - timedelta(days=PAST_DAYS)
    since = now - timedelta(days=PAST_DAYS)
    events: list[Event] = []

    jobs = db.scalars(
        select(JobApplication).where(
            JobApplication.user_id == user.id,
            JobApplication.status.notin_(INACTIVE_JOB_STATUSES),
        )
    )
    for job in jobs:
        name = f"{job.company_name}: {job.position_title}"
        if job.deadline and job.deadline >= since_day:
            events.append(Event(f"job-deadline-{job.id}", f"Deadline: {name}", job.deadline))
        if job.follow_up_date and job.follow_up_date >= since_day:
            events.append(
                Event(f"job-follow-up-{job.id}", f"Follow up: {name}", job.follow_up_date)
            )
        if job.interview_at and job.interview_at >= since:
            events.append(
                Event(
                    f"job-interview-{job.id}",
                    f"Interview: {name}",
                    job.interview_at,
                    INTERVIEW_LENGTH,
                    job.location,
                )
            )

    research = db.scalars(
        select(ResearchOpportunity).where(
            ResearchOpportunity.user_id == user.id,
            ResearchOpportunity.status.notin_(INACTIVE_RESEARCH_STATUSES),
            ResearchOpportunity.deadline >= since_day,
        )
    )
    for item in research:
        assert item.deadline is not None
        events.append(
            Event(
                f"research-deadline-{item.id}",
                f"Deadline: {item.title} ({item.organization})",
                item.deadline,
            )
        )

    projects = {
        p.id: p
        for p in db.scalars(
            select(ResearchProject).where(
                ResearchProject.user_id == user.id, ResearchProject.stage.notin_(INACTIVE_STAGES)
            )
        )
    }
    for project in projects.values():
        if project.target_date and project.target_date >= since_day:
            events.append(
                Event(
                    f"project-target-{project.id}", f"Target: {project.title}", project.target_date
                )
            )

    if projects:
        submissions = db.scalars(
            select(ProjectSubmission).where(
                ProjectSubmission.user_id == user.id,
                ProjectSubmission.project_id.in_(projects),
                ProjectSubmission.status.in_(OPEN_SUBMISSION_STATUSES),
            )
        )
        for sub in submissions:
            title = projects[sub.project_id].title
            abstract_due = sub.abstract_deadline and sub.abstract_submitted_on is None
            if abstract_due and sub.abstract_deadline and sub.abstract_deadline >= since_day:
                events.append(
                    Event(
                        f"submission-abstract-{sub.id}",
                        f"Abstract due: {sub.venue_name} ({title})",
                        sub.abstract_deadline,
                    )
                )
            if sub.paper_deadline and sub.paper_deadline >= since_day:
                events.append(
                    Event(
                        f"submission-paper-{sub.id}",
                        f"Paper due: {sub.venue_name} ({title})",
                        sub.paper_deadline,
                    )
                )

        milestones = db.scalars(
            select(ProjectMilestone).where(
                ProjectMilestone.user_id == user.id,
                ProjectMilestone.project_id.in_(projects),
                ProjectMilestone.is_done.is_(False),
                ProjectMilestone.due_date >= since_day,
            )
        )
        for milestone in milestones:
            assert milestone.due_date is not None
            events.append(
                Event(
                    f"milestone-{milestone.id}",
                    f"Milestone: {milestone.title} ({projects[milestone.project_id].title})",
                    milestone.due_date,
                )
            )

    reminders = db.scalars(
        select(Reminder).where(
            Reminder.user_id == user.id,
            Reminder.is_completed.is_(False),
            Reminder.due_at >= since,
        )
    )
    for reminder in reminders:
        events.append(
            Event(
                f"reminder-{reminder.id}",
                f"Reminder: {reminder.title}",
                reminder.due_at,
                REMINDER_LENGTH,
                reminder.description,
            )
        )

    events.sort(key=lambda e: (_sort_key(e.start), e.uid))
    return events


def _sort_key(value: date | datetime) -> datetime:
    if isinstance(value, datetime):
        return value.astimezone(UTC)
    return datetime(value.year, value.month, value.day, tzinfo=UTC)


# --- iCalendar text ---------------------------------------------------------------------------


def _escape(text: str) -> str:
    # RFC 5545 3.3.11: backslash, semicolon, comma and newlines are escaped in TEXT values.
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def _fold(line: str) -> str:
    # RFC 5545 3.1: lines longer than 75 octets continue on the next line after a space,
    # splitting between characters, never inside a multi-byte one.
    out: list[str] = []
    current = ""
    size = 0
    for char in line:
        width = len(char.encode())
        if size + width > 75:
            out.append(current)
            # The leading space counts towards the next line's 75.
            current, size = " ", 1
        current += char
        size += width
    out.append(current)
    return "\r\n".join(out)


def _utc_stamp(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def _day(value: date) -> str:
    return value.strftime("%Y%m%d")


def render_ics(events: list[Event], now: datetime | None = None) -> str:
    stamp = _utc_stamp(datetime.now(UTC) if now is None else now)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//CareerLab//Calendar feed//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:CareerLab",
        "X-WR-CALDESC:Deadlines\\, interviews and reminders from CareerLab",
        # A hint only: Google Calendar ignores it and refreshes on its own schedule.
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
        "X-PUBLISHED-TTL:PT1H",
    ]
    for event in events:
        lines += ["BEGIN:VEVENT", f"UID:{event.uid}@careerlab", f"DTSTAMP:{stamp}"]
        if isinstance(event.start, datetime):
            end = event.start + (event.length or timedelta(0))
            lines += [f"DTSTART:{_utc_stamp(event.start)}", f"DTEND:{_utc_stamp(end)}"]
        else:
            lines += [
                f"DTSTART;VALUE=DATE:{_day(event.start)}",
                f"DTEND;VALUE=DATE:{_day(event.start + timedelta(days=1))}",
                "TRANSP:TRANSPARENT",
            ]
        lines.append(f"SUMMARY:{_escape(event.summary)}")
        if event.description:
            lines.append(f"DESCRIPTION:{_escape(event.description)}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "".join(_fold(line) + "\r\n" for line in lines)
