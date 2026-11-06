"""Polymorphic targets: notes, reminders and contact links point at jobs, research and contacts.

These ids cannot be foreign keys, so ownership is checked here and dependents are removed
here. Neither function commits: the caller's delete runs in the same transaction.
"""

import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.modules.auth.models import User
from app.modules.contacts.models import Contact, ContactLink
from app.modules.entity_types import EntityType
from app.modules.jobs.models import JobApplication
from app.modules.notes.models import Note
from app.modules.reminders.models import Reminder
from app.modules.research.models import ResearchOpportunity


def job_label(job: JobApplication) -> str:
    return f"{job.position_title} at {job.company_name}"


def research_label(item: ResearchOpportunity) -> str:
    return f"{item.title} ({item.organization})"


def contact_label(contact: Contact) -> str:
    return contact.name


def assert_entity_owned(db: Session, user: User, entity_type: str, entity_id: uuid.UUID) -> str:
    """Return the record's label, or raise 404 when it is missing or someone else's."""
    match entity_type:
        case EntityType.job:
            job = db.scalar(
                select(JobApplication).where(
                    JobApplication.id == entity_id, JobApplication.user_id == user.id
                )
            )
            label = job_label(job) if job else None
        case EntityType.research:
            item = db.scalar(
                select(ResearchOpportunity).where(
                    ResearchOpportunity.id == entity_id, ResearchOpportunity.user_id == user.id
                )
            )
            label = research_label(item) if item else None
        case EntityType.contact:
            contact = db.scalar(
                select(Contact).where(Contact.id == entity_id, Contact.user_id == user.id)
            )
            label = contact_label(contact) if contact else None
        case _:
            label = None
    if label is None:
        raise not_found()
    return label


def delete_dependents(db: Session, user: User, entity_type: str, entity_id: uuid.UUID) -> None:
    """Remove the notes, reminders and contact links that belong to a record.

    For a contact this also removes the links where it is the contact. Activity logs stay.
    """
    db.execute(
        delete(Note).where(
            Note.user_id == user.id, Note.entity_type == entity_type, Note.entity_id == entity_id
        )
    )
    db.execute(
        delete(Reminder).where(
            Reminder.user_id == user.id,
            Reminder.related_type == entity_type,
            Reminder.related_id == entity_id,
        )
    )
    if entity_type == EntityType.contact:
        link_match = ContactLink.contact_id == entity_id
    else:
        link_match = (ContactLink.entity_type == entity_type) & (ContactLink.entity_id == entity_id)
    db.execute(delete(ContactLink).where(ContactLink.user_id == user.id, link_match))
