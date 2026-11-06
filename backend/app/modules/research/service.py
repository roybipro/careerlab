import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.core.lists import ListParams, Page, contains, iso, paginate
from app.modules.activity.service import log_activity
from app.modules.auth.models import User
from app.modules.research.models import ResearchOpportunity, ResearchStatus
from app.modules.research.schemas import ResearchCreate, ResearchFilters, ResearchUpdate

ENTITY = "research"

SORT_FIELDS = {
    "created_at": ResearchOpportunity.created_at,
    "updated_at": ResearchOpportunity.updated_at,
    "title": ResearchOpportunity.title,
    "organization": ResearchOpportunity.organization,
    "country": ResearchOpportunity.country,
    "application_date": ResearchOpportunity.application_date,
    "deadline": ResearchOpportunity.deadline,
}


def _label(item: ResearchOpportunity) -> str:
    return f"{item.title} ({item.organization})"


def list_research(
    db: Session, user: User, params: ListParams, filters: ResearchFilters
) -> Page[Any]:
    stmt = select(ResearchOpportunity).where(ResearchOpportunity.user_id == user.id)
    if params.q:
        stmt = stmt.where(
            contains(ResearchOpportunity.title, params.q)
            | contains(ResearchOpportunity.organization, params.q)
            | contains(ResearchOpportunity.professor_name, params.q)
            | contains(ResearchOpportunity.research_area, params.q)
        )
    if filters.status:
        stmt = stmt.where(ResearchOpportunity.status == filters.status)
    if filters.opportunity_type:
        stmt = stmt.where(ResearchOpportunity.opportunity_type == filters.opportunity_type)
    if filters.funding_status:
        stmt = stmt.where(ResearchOpportunity.funding_status == filters.funding_status)
    if filters.country:
        stmt = stmt.where(
            func.lower(ResearchOpportunity.country) == filters.country.strip().lower()
        )
    if filters.deadline_from:
        stmt = stmt.where(ResearchOpportunity.deadline >= filters.deadline_from)
    if filters.deadline_to:
        stmt = stmt.where(ResearchOpportunity.deadline <= filters.deadline_to)
    return paginate(db, stmt, params, SORT_FIELDS, "-created_at")


def get_research(db: Session, user: User, research_id: uuid.UUID) -> ResearchOpportunity:
    item = db.scalar(
        select(ResearchOpportunity).where(
            ResearchOpportunity.id == research_id, ResearchOpportunity.user_id == user.id
        )
    )
    if item is None:
        raise not_found()
    return item


def create_research(db: Session, user: User, data: ResearchCreate) -> ResearchOpportunity:
    item = ResearchOpportunity(user_id=user.id, **data.model_dump())
    db.add(item)
    db.flush()
    log_activity(db, user, ENTITY, item.id, "created", _label(item))
    db.commit()
    return item


def update_research(
    db: Session, user: User, research_id: uuid.UUID, data: ResearchUpdate
) -> ResearchOpportunity:
    item = get_research(db, user, research_id)
    # exclude_unset: omitted fields stay as stored, explicit nulls clear them.
    changes = {
        k: v for k, v in data.model_dump(exclude_unset=True).items() if getattr(item, k) != v
    }
    if not changes:
        return item

    old = {k: getattr(item, k) for k in changes}
    for field, value in changes.items():
        setattr(item, field, value)

    label = _label(item)
    if "status" in changes:
        log_activity(
            db, user, ENTITY, item.id, "status_changed", label, old=old["status"], new=item.status
        )
        if item.status == ResearchStatus.archived:
            log_activity(db, user, ENTITY, item.id, "archived", label)
    if "deadline" in changes:
        log_activity(
            db,
            user,
            ENTITY,
            item.id,
            "deadline_updated",
            label,
            old=iso(old["deadline"]),
            new=iso(item.deadline),
        )
    db.commit()
    return item


def delete_research(db: Session, user: User, research_id: uuid.UUID) -> None:
    item = get_research(db, user, research_id)
    log_activity(db, user, ENTITY, item.id, "deleted", _label(item))
    db.delete(item)
    db.commit()
