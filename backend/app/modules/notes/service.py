import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.core.lists import ListParams, Page, contains, paginate
from app.modules.auth.models import User
from app.modules.entities import assert_entity_owned
from app.modules.notes.models import Note
from app.modules.notes.schemas import NoteCreate, NoteFilters, NoteUpdate

SORT_FIELDS = {"created_at": Note.created_at, "updated_at": Note.updated_at}


def list_notes(db: Session, user: User, params: ListParams, filters: NoteFilters) -> Page[Any]:
    stmt = select(Note).where(Note.user_id == user.id)
    if params.q:
        stmt = stmt.where(contains(Note.content, params.q))
    if filters.entity_type:
        stmt = stmt.where(Note.entity_type == filters.entity_type)
    if filters.entity_id:
        stmt = stmt.where(Note.entity_id == filters.entity_id)
    if filters.kind:
        stmt = stmt.where(Note.kind == filters.kind)
    return paginate(db, stmt, params, SORT_FIELDS, "-created_at")


def get_note(db: Session, user: User, note_id: uuid.UUID) -> Note:
    note = db.scalar(select(Note).where(Note.id == note_id, Note.user_id == user.id))
    if note is None:
        raise not_found()
    return note


def create_note(db: Session, user: User, data: NoteCreate) -> Note:
    assert_entity_owned(db, user, data.entity_type, data.entity_id)
    note = Note(user_id=user.id, **data.model_dump())
    db.add(note)
    db.commit()
    return note


def update_note(db: Session, user: User, note_id: uuid.UUID, data: NoteUpdate) -> Note:
    note = get_note(db, user, note_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(note, field, value)
    db.commit()
    return note


def delete_note(db: Session, user: User, note_id: uuid.UUID) -> None:
    db.delete(get_note(db, user, note_id))
    db.commit()
