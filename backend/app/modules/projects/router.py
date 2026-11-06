import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import ClientToday, CurrentUser, DbSession, require_csrf
from app.core.lists import ListQuery, Page
from app.modules.projects import service
from app.modules.projects.schemas import (
    ProjectCreate,
    ProjectFilters,
    ProjectOut,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["projects"], dependencies=[Depends(require_csrf)])


@router.get("", response_model=Page[ProjectOut])
def list_projects(
    params: ListQuery,
    filters: Annotated[ProjectFilters, Query()],
    user: CurrentUser,
    db: DbSession,
    today: ClientToday,
) -> Page[ProjectOut]:
    return service.list_projects(db, user, params, filters, today)


@router.post("", status_code=201, response_model=ProjectOut)
def create_project(
    body: ProjectCreate, user: CurrentUser, db: DbSession, today: ClientToday
) -> ProjectOut:
    return service.create_project(db, user, body, today)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: uuid.UUID, user: CurrentUser, db: DbSession, today: ClientToday
) -> ProjectOut:
    return service.read_project(db, user, project_id, today)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    user: CurrentUser,
    db: DbSession,
    today: ClientToday,
) -> ProjectOut:
    return service.update_project(db, user, project_id, body, today)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    service.delete_project(db, user, project_id)
