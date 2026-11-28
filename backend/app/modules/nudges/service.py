"""Nudges: open work that has gone quiet and may need chasing.

- A job still "applied" 14+ days after it was applied for (or last edited, when no applied
  date is set), with no follow-up scheduled after today.
- A research opportunity still "applied" or "contacted professor", on the same clock.
- A contact linked to an active job or research opportunity, last contacted 60+ days ago,
  with no follow-up scheduled after today.

Each can be snoozed: it is hidden until a chosen day, and shows again then if still quiet.
"""

import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy import Date, cast, exists, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.modules.auth.models import User
from app.modules.contacts.models import Contact, ContactLink
from app.modules.dashboard.service import INACTIVE_JOB_STATUSES, INACTIVE_RESEARCH_STATUSES
from app.modules.entities import job_label, research_label
from app.modules.entity_types import LinkableType
from app.modules.jobs.models import JobApplication, JobStatus
from app.modules.nudges.models import NudgeSnooze
from app.modules.research.models import ResearchOpportunity, ResearchStatus

QUIET_DAYS = 14
CONTACT_QUIET_DAYS = 60
NUDGE_LIMIT = 20
WAITING_RESEARCH_STATUSES = (ResearchStatus.applied, ResearchStatus.contacted_professor)
SNOOZABLE: dict[str, type[JobApplication] | type[ResearchOpportunity] | type[Contact]] = {
    "job": JobApplication,
    "research": ResearchOpportunity,
    "contact": Contact,
}


def _not_snoozed(user: User, entity_type: str, entity_id: Any, today: date) -> Any:
    return ~exists().where(
        NudgeSnooze.user_id == user.id,
        NudgeSnooze.entity_type == entity_type,
        NudgeSnooze.entity_id == entity_id,
        NudgeSnooze.until > today,
    )


def list_nudges(db: Session, user: User, today: date) -> list[dict[str, Any]]:
    nudges: list[dict[str, Any]] = []
    cutoff = today - timedelta(days=QUIET_DAYS)

    job_since = func.coalesce(
        JobApplication.application_date, cast(JobApplication.updated_at, Date)
    )
    for job, since in db.execute(
        select(JobApplication, job_since).where(
            JobApplication.user_id == user.id,
            JobApplication.status == JobStatus.applied,
            job_since <= cutoff,
            or_(JobApplication.follow_up_date.is_(None), JobApplication.follow_up_date <= today),
            _not_snoozed(user, "job", JobApplication.id, today),
        )
    ):
        nudges.append(
            {
                "kind": "job",
                "id": job.id,
                "title": job_label(job),
                "reason": "no_reply",
                "since": since,
                "days": (today - since).days,
            }
        )

    research_since = func.coalesce(
        ResearchOpportunity.application_date, cast(ResearchOpportunity.updated_at, Date)
    )
    for item, since in db.execute(
        select(ResearchOpportunity, research_since).where(
            ResearchOpportunity.user_id == user.id,
            ResearchOpportunity.status.in_(WAITING_RESEARCH_STATUSES),
            research_since <= cutoff,
            _not_snoozed(user, "research", ResearchOpportunity.id, today),
        )
    ):
        nudges.append(
            {
                "kind": "research",
                "id": item.id,
                "title": research_label(item),
                "reason": "no_reply",
                "since": since,
                "days": (today - since).days,
            }
        )

    active_job_link = exists().where(
        ContactLink.contact_id == Contact.id,
        ContactLink.entity_type == LinkableType.job,
        JobApplication.id == ContactLink.entity_id,
        JobApplication.user_id == user.id,
        JobApplication.status.notin_(INACTIVE_JOB_STATUSES),
    )
    active_research_link = exists().where(
        ContactLink.contact_id == Contact.id,
        ContactLink.entity_type == LinkableType.research,
        ResearchOpportunity.id == ContactLink.entity_id,
        ResearchOpportunity.user_id == user.id,
        ResearchOpportunity.status.notin_(INACTIVE_RESEARCH_STATUSES),
    )
    for contact in db.scalars(
        select(Contact).where(
            Contact.user_id == user.id,
            Contact.last_contacted_at <= today - timedelta(days=CONTACT_QUIET_DAYS),
            or_(Contact.next_follow_up_at.is_(None), Contact.next_follow_up_at <= today),
            or_(active_job_link, active_research_link),
            _not_snoozed(user, "contact", Contact.id, today),
        )
    ):
        assert contact.last_contacted_at is not None
        nudges.append(
            {
                "kind": "contact",
                "id": contact.id,
                "title": contact.name,
                "reason": "quiet_contact",
                "since": contact.last_contacted_at,
                "days": (today - contact.last_contacted_at).days,
            }
        )

    # Longest-waiting first.
    nudges.sort(key=lambda n: (-n["days"], n["kind"], str(n["id"])))
    return nudges[:NUDGE_LIMIT]


def snooze(db: Session, user: User, entity_type: str, entity_id: uuid.UUID, until: date) -> None:
    model = SNOOZABLE[entity_type]
    owned = db.scalar(select(model.id).where(model.id == entity_id, model.user_id == user.id))
    if owned is None:
        raise not_found()
    stmt = insert(NudgeSnooze).values(
        id=uuid.uuid4(), user_id=user.id, entity_type=entity_type, entity_id=entity_id, until=until
    )
    db.execute(
        stmt.on_conflict_do_update(
            constraint="uq_nudge_snoozes_entity",
            set_={"until": stmt.excluded.until, "updated_at": func.now()},
        )
    )
    db.commit()
