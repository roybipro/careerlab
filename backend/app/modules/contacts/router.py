import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import ClientToday, CurrentUser, DbSession, require_csrf
from app.core.lists import ListQuery, Page
from app.modules.contacts import service
from app.modules.contacts.schemas import (
    ContactCreate,
    ContactDetail,
    ContactFilters,
    ContactLinkIn,
    ContactLinkOut,
    ContactOut,
    ContactUpdate,
)

router = APIRouter(prefix="/contacts", tags=["contacts"], dependencies=[Depends(require_csrf)])


@router.get("", response_model=Page[ContactOut])
def list_contacts(
    params: ListQuery,
    filters: Annotated[ContactFilters, Query()],
    user: CurrentUser,
    db: DbSession,
    today: ClientToday,
) -> Page[ContactOut]:
    return service.list_contacts(db, user, params, filters, today)


@router.post("", status_code=201, response_model=ContactDetail)
def create_contact(body: ContactCreate, user: CurrentUser, db: DbSession) -> ContactDetail:
    return service.create_contact(db, user, body)


@router.get("/{contact_id}", response_model=ContactDetail)
def get_contact(contact_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ContactDetail:
    return service.get_contact(db, user, contact_id)


@router.patch("/{contact_id}", response_model=ContactDetail)
def update_contact(
    contact_id: uuid.UUID, body: ContactUpdate, user: CurrentUser, db: DbSession
) -> ContactDetail:
    return service.update_contact(db, user, contact_id, body)


@router.delete("/{contact_id}", status_code=204)
def delete_contact(contact_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    service.delete_contact(db, user, contact_id)


@router.post("/{contact_id}/links", status_code=201, response_model=ContactLinkOut)
def add_link(
    contact_id: uuid.UUID, body: ContactLinkIn, user: CurrentUser, db: DbSession
) -> ContactLinkOut:
    return service.add_link(db, user, contact_id, body)


@router.delete("/{contact_id}/links/{link_id}", status_code=204)
def remove_link(
    contact_id: uuid.UUID, link_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> None:
    service.remove_link(db, user, contact_id, link_id)
