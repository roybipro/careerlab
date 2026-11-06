import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.core.lists import ListParams, Page, contains, paginate
from app.modules.activity.service import log_activity
from app.modules.auth.models import User
from app.modules.contacts.models import Contact, ContactLink
from app.modules.contacts.schemas import (
    ContactCreate,
    ContactDetail,
    ContactFilters,
    ContactLinkIn,
    ContactLinkOut,
    ContactOut,
    ContactUpdate,
)
from app.modules.entities import (
    assert_entity_owned,
    contact_label,
    delete_dependents,
    job_label,
    research_label,
)
from app.modules.jobs.models import JobApplication
from app.modules.research.models import ResearchOpportunity

ENTITY = "contact"

SORT_FIELDS = {
    "created_at": Contact.created_at,
    "updated_at": Contact.updated_at,
    "name": Contact.name,
    "organization": Contact.organization,
    "last_contacted_at": Contact.last_contacted_at,
    "next_follow_up_at": Contact.next_follow_up_at,
}


def list_contacts(
    db: Session, user: User, params: ListParams, filters: ContactFilters, today: date
) -> Page[Any]:
    stmt = select(Contact).where(Contact.user_id == user.id)
    if params.q:
        stmt = stmt.where(
            contains(Contact.name, params.q)
            | contains(Contact.email, params.q)
            | contains(Contact.organization, params.q)
            | contains(Contact.position, params.q)
        )
    if filters.contact_type:
        stmt = stmt.where(Contact.contact_type == filters.contact_type)
    if filters.entity_type or filters.entity_id:
        linked = select(ContactLink.contact_id).where(ContactLink.user_id == user.id)
        if filters.entity_type:
            linked = linked.where(ContactLink.entity_type == filters.entity_type)
        if filters.entity_id:
            linked = linked.where(ContactLink.entity_id == filters.entity_id)
        stmt = stmt.where(Contact.id.in_(linked))
    if filters.follow_up_due:
        # Due on the client's today or earlier; a contact with no follow-up date is never due.
        stmt = stmt.where(Contact.next_follow_up_at <= today)
    return paginate(db, stmt, params, SORT_FIELDS, "name")


def _get_contact(db: Session, user: User, contact_id: uuid.UUID) -> Contact:
    contact = db.scalar(select(Contact).where(Contact.id == contact_id, Contact.user_id == user.id))
    if contact is None:
        raise not_found()
    return contact


def _link_labels(db: Session, user: User, links: list[ContactLink]) -> list[ContactLinkOut]:
    job_ids = [x.entity_id for x in links if x.entity_type == "job"]
    research_ids = [x.entity_id for x in links if x.entity_type == "research"]
    jobs = {
        j.id: job_label(j)
        for j in db.scalars(
            select(JobApplication).where(
                JobApplication.user_id == user.id, JobApplication.id.in_(job_ids)
            )
        )
    }
    research = {
        r.id: research_label(r)
        for r in db.scalars(
            select(ResearchOpportunity).where(
                ResearchOpportunity.user_id == user.id, ResearchOpportunity.id.in_(research_ids)
            )
        )
    }
    labels = {"job": jobs, "research": research}
    # A link whose target row is gone (ids are not foreign keys) has no label; skip it
    # rather than fail the whole contact.
    return [
        ContactLinkOut(
            id=x.id,
            entity_type=x.entity_type,
            entity_id=x.entity_id,
            label=labels[x.entity_type][x.entity_id],
        )
        for x in links
        if x.entity_id in labels[x.entity_type]
    ]


def get_contact(db: Session, user: User, contact_id: uuid.UUID) -> ContactDetail:
    contact = _get_contact(db, user, contact_id)
    links = db.scalars(
        select(ContactLink)
        .where(ContactLink.contact_id == contact.id, ContactLink.user_id == user.id)
        .order_by(ContactLink.entity_type, ContactLink.id)
    ).all()
    return ContactDetail(
        **ContactOut.model_validate(contact).model_dump(), links=_link_labels(db, user, list(links))
    )


def create_contact(db: Session, user: User, data: ContactCreate) -> ContactDetail:
    contact = Contact(user_id=user.id, **data.model_dump())
    db.add(contact)
    db.flush()
    log_activity(db, user, ENTITY, contact.id, "created", contact_label(contact))
    db.commit()
    return get_contact(db, user, contact.id)


def update_contact(
    db: Session, user: User, contact_id: uuid.UUID, data: ContactUpdate
) -> ContactDetail:
    contact = _get_contact(db, user, contact_id)
    # exclude_unset: omitted fields stay as stored, explicit nulls clear them.
    for field, value in data.model_dump(exclude_unset=True).items():
        if getattr(contact, field) != value:
            setattr(contact, field, value)
    db.commit()
    return get_contact(db, user, contact.id)


def delete_contact(db: Session, user: User, contact_id: uuid.UUID) -> None:
    contact = _get_contact(db, user, contact_id)
    log_activity(db, user, ENTITY, contact.id, "deleted", contact_label(contact))
    delete_dependents(db, user, ENTITY, contact.id)
    db.delete(contact)
    db.commit()


def add_link(db: Session, user: User, contact_id: uuid.UUID, data: ContactLinkIn) -> ContactLinkOut:
    contact = _get_contact(db, user, contact_id)
    label = assert_entity_owned(db, user, data.entity_type, data.entity_id)
    link = ContactLink(
        user_id=user.id,
        contact_id=contact.id,
        entity_type=data.entity_type,
        entity_id=data.entity_id,
    )
    db.add(link)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "conflict", "Contact is already linked to this record") from None
    log_activity(
        db,
        user,
        data.entity_type,
        data.entity_id,
        "contact_added",
        label,
        contact_id=str(contact.id),
        contact_name=contact.name,
    )
    db.commit()
    return ContactLinkOut(
        id=link.id, entity_type=link.entity_type, entity_id=link.entity_id, label=label
    )


def remove_link(db: Session, user: User, contact_id: uuid.UUID, link_id: uuid.UUID) -> None:
    link = db.scalar(
        select(ContactLink).where(
            ContactLink.id == link_id,
            ContactLink.contact_id == contact_id,
            ContactLink.user_id == user.id,
        )
    )
    if link is None:
        raise not_found()
    db.delete(link)
    db.commit()
