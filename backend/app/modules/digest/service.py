"""The daily email digest: what is overdue, what is due in the next week, and what needs a nudge.

Opt-in per user (users.email_digest). A scheduler calls POST /internal/digests once a day;
each user gets at most one digest per UTC day (users.last_digest_on), so a retried run does
not send twice, and nobody gets an email on a day with nothing in it.

"Today" is the UTC date: the API has no user time zone. The links in the email point at the
frontend (FRONTEND_ORIGIN), which also serves the API, so the unsubscribe link is there too.
"""

import html
import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import jwt
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.modules.auth.models import User
from app.modules.dashboard.service import overdue_research, upcoming_deadlines
from app.modules.digest import email
from app.modules.nudges.service import list_nudges
from app.modules.reminders.models import Reminder

logger = logging.getLogger(__name__)

UPCOMING_DAYS = 7
SECTION_LIMIT = 15
UNSUBSCRIBE_PURPOSE = "email-digest-unsubscribe"
UNSUBSCRIBE_PATH = "/api/v1/notifications/email/unsubscribe"


@dataclass
class Line:
    title: str
    detail: str
    path: str


@dataclass
class Digest:
    overdue: list[Line] = field(default_factory=list)
    upcoming: list[Line] = field(default_factory=list)
    nudges: list[Line] = field(default_factory=list)

    @property
    def empty(self) -> bool:
        return not (self.overdue or self.upcoming or self.nudges)


# --- Unsubscribe links --------------------------------------------------------------------------


def unsubscribe_token(user: User) -> str:
    # No expiry: an unsubscribe link in an old email must keep working.
    payload = {"sub": str(user.id), "purpose": UNSUBSCRIBE_PURPOSE}
    return jwt.encode(payload, get_settings().JWT_SECRET, algorithm="HS256")


def user_for_unsubscribe(db: Session, token: str) -> User:
    invalid = AppError(400, "invalid_token", "This unsubscribe link is not valid")
    try:
        payload = jwt.decode(
            token, get_settings().JWT_SECRET, algorithms=["HS256"], options={"require": ["sub"]}
        )
    except jwt.PyJWTError:
        raise invalid from None
    if payload.get("purpose") != UNSUBSCRIBE_PURPOSE:
        raise invalid
    try:
        user = db.get(User, uuid.UUID(payload["sub"]))
    except (ValueError, TypeError, AttributeError):
        raise invalid from None
    if user is None:
        raise invalid
    return user


def unsubscribe_url(user: User) -> str:
    query = urlencode({"token": unsubscribe_token(user)})
    return f"{get_settings().FRONTEND_ORIGIN}{UNSUBSCRIBE_PATH}?{query}"


# --- Building -----------------------------------------------------------------------------------


def _day(value: date | datetime) -> str:
    if isinstance(value, datetime):
        return value.astimezone(UTC).strftime("%a %d %b, %H:%M UTC")
    return value.strftime("%a %d %b")


_PATHS = {
    "job": "/jobs/{}",
    "research": "/research/{}",
    "project": "/projects/{}",
    "contact": "/contacts/{}",
}


def _path(kind: str | None, record_id: Any) -> str:
    template = _PATHS.get(kind or "")
    return template.format(record_id) if template and record_id else "/dashboard"


_KIND_LABEL = {
    "job_deadline": "Job deadline",
    "research_deadline": "Research deadline",
    "reminder": "Reminder",
    "project_submission_deadline": "Submission deadline",
    "project_milestone": "Milestone",
}


def build_digest(db: Session, user: User, now: datetime | None = None) -> Digest:
    now = datetime.now(UTC) if now is None else now.astimezone(UTC)
    today = now.date()
    digest = Digest()

    for reminder in db.scalars(
        select(Reminder)
        .where(
            Reminder.user_id == user.id,
            Reminder.is_completed.is_(False),
            Reminder.due_at < now,
        )
        .order_by(Reminder.due_at)
        .limit(SECTION_LIMIT)
    ):
        digest.overdue.append(
            Line(
                reminder.title,
                f"Reminder, was due {_day(reminder.due_at)}",
                "/reminders?state=overdue",
            )
        )
    for item in overdue_research(db, user, now, today)[:SECTION_LIMIT]:
        digest.overdue.append(
            Line(
                f"{item['title']} ({item['project_title']})",
                f"{_KIND_LABEL.get(item['kind'], 'Deadline')}, was due {_day(item['due'])}",
                _path("project", item["project_id"]),
            )
        )

    horizon = now + timedelta(days=UPCOMING_DAYS)
    for item in upcoming_deadlines(db, user, now, today):
        due = item["due"]
        instant = (
            due if isinstance(due, datetime) else datetime(due.year, due.month, due.day, tzinfo=UTC)
        )
        if instant > horizon:
            continue
        title = item["title"]
        if item.get("project_title"):
            title = f"{title} ({item['project_title']})"
        digest.upcoming.append(
            Line(
                title,
                f"{_KIND_LABEL.get(item['kind'], 'Deadline')}, {_day(due)}",
                _path(item.get("related_type"), item.get("related_id")),
            )
        )
        if len(digest.upcoming) >= SECTION_LIMIT:
            break

    for nudge in list_nudges(db, user, today)[:SECTION_LIMIT]:
        detail = (
            f"Last contacted {nudge['days']} days ago"
            if nudge["reason"] == "quiet_contact"
            else f"Waiting {nudge['days']} days for a reply"
        )
        digest.nudges.append(Line(nudge["title"], detail, _path(nudge["kind"], nudge["id"])))

    return digest


def _subject(digest: Digest) -> str:
    parts = []
    if digest.overdue:
        parts.append(f"{len(digest.overdue)} overdue")
    if digest.upcoming:
        parts.append(f"{len(digest.upcoming)} due this week")
    if digest.nudges:
        n = len(digest.nudges)
        parts.append(f"{n} to follow up" if n != 1 else "1 to follow up")
    return "CareerLab: " + ", ".join(parts)


# Inline styles: most mail apps ignore <style> blocks.
_WRAP = (
    "font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;"
    "margin:0 auto;color:#1f2937;line-height:1.5"
)
_H2 = "font-size:15px;margin:24px 0 8px"
_UL = "padding-left:18px;margin:0"
_LINK = "color:#5b3fbf"
_DETAIL = "color:#6b7280;font-size:13px"
_FOOT = "color:#9ca3af;font-size:12px"


def render(digest: Digest, user: User, unsubscribe: str) -> tuple[str, str, str]:
    """Returns (subject, html, text)."""
    origin = get_settings().FRONTEND_ORIGIN
    sections = [
        ("Overdue", digest.overdue),
        (f"Due in the next {UPCOMING_DAYS} days", digest.upcoming),
        ("Worth a follow-up", digest.nudges),
    ]
    first_name = user.full_name.split(" ")[0]

    text_lines = [f"Hi {first_name}, here is your CareerLab day.", ""]
    for heading, lines in sections:
        if not lines:
            continue
        text_lines += [heading, "-" * len(heading)]
        text_lines += [f"- {line.title}: {line.detail}\n  {origin}{line.path}" for line in lines]
        text_lines.append("")
    text_lines += [f"Open CareerLab: {origin}/dashboard", f"Stop these emails: {unsubscribe}"]

    e = html.escape
    parts = [
        f'<div style="{_WRAP}">',
        f'<p style="font-size:16px">Hi {e(first_name)}, here is your CareerLab day.</p>',
    ]
    for heading, lines in sections:
        if not lines:
            continue
        parts.append(f'<h2 style="{_H2}">{e(heading)}</h2><ul style="{_UL}">')
        for line in lines:
            href = e(origin + line.path)
            parts.append(
                f'<li style="margin:0 0 8px"><a href="{href}" style="{_LINK}">{e(line.title)}</a>'
                f'<br><span style="{_DETAIL}">{e(line.detail)}</span></li>'
            )
        parts.append("</ul>")
    parts.append(
        f'<p style="margin-top:28px"><a href="{e(origin)}/dashboard" style="{_LINK}">'
        "Open CareerLab</a></p>"
        f'<p style="{_FOOT}">You get this because you turned on the daily digest. '
        f'<a href="{e(unsubscribe)}" style="{_FOOT}">Stop these emails</a>.</p></div>'
    )
    return _subject(digest), "".join(parts), "\n".join(text_lines)


# --- Sending ------------------------------------------------------------------------------------


def send_digest(db: Session, user: User, now: datetime | None = None) -> bool:
    """Sends today's digest if there is anything in it. Returns whether one was sent."""
    digest = build_digest(db, user, now)
    if digest.empty:
        return False
    link = unsubscribe_url(user)
    subject, body_html, body_text = render(digest, user, link)
    email.send_email(
        to=user.email,
        subject=subject,
        html=body_html,
        text=body_text,
        # RFC 8058 one-click unsubscribe: mail apps show an Unsubscribe button that POSTs here.
        headers={
            "List-Unsubscribe": f"<{link}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    )
    return True


def send_due_digests(db: Session, now: datetime | None = None) -> dict[str, int]:
    now = datetime.now(UTC) if now is None else now.astimezone(UTC)
    today = now.date()
    counts = {"sent": 0, "skipped": 0, "failed": 0}
    users = db.scalars(
        select(User).where(
            User.email_digest.is_(True),
            or_(User.last_digest_on.is_(None), User.last_digest_on < today),
        )
    ).all()
    for user in users:
        try:
            sent = send_digest(db, user, now)
        except Exception:
            # One user's failure (the email provider, or their data) must not stop the rest.
            # Logged without the address; the next run tries again.
            logger.exception("Digest failed for user %s", user.id)
            db.rollback()
            counts["failed"] += 1
            continue
        if sent:
            user.last_digest_on = today
            db.commit()
            counts["sent"] += 1
        else:
            counts["skipped"] += 1
    return counts
