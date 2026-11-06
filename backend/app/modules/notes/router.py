import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import CurrentUser, DbSession, require_csrf
from app.core.lists import ListQuery, Page
from app.modules.notes import service
from app.modules.notes.models import Note
from app.modules.notes.schemas import NoteCreate, NoteFilters, NoteOut, NoteUpdate

router = APIRouter(prefix="/notes", tags=["notes"], dependencies=[Depends(require_csrf)])


@router.get("", response_model=Page[NoteOut])
def list_notes(
    params: ListQuery, filters: Annotated[NoteFilters, Query()], user: CurrentUser, db: DbSession
) -> Page[NoteOut]:
    return service.list_notes(db, user, params, filters)


@router.post("", status_code=201, response_model=NoteOut)
def create_note(body: NoteCreate, user: CurrentUser, db: DbSession) -> Note:
    return service.create_note(db, user, body)


@router.patch("/{note_id}", response_model=NoteOut)
def update_note(note_id: uuid.UUID, body: NoteUpdate, user: CurrentUser, db: DbSession) -> Note:
    return service.update_note(db, user, note_id, body)


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    service.delete_note(db, user, note_id)
