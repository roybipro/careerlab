import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import CurrentUser, DbSession, require_csrf
from app.core.lists import ListQuery, Page
from app.modules.research import service
from app.modules.research.models import ResearchOpportunity
from app.modules.research.schemas import (
    ResearchCreate,
    ResearchFilters,
    ResearchOut,
    ResearchUpdate,
)

router = APIRouter(prefix="/research", tags=["research"], dependencies=[Depends(require_csrf)])


@router.get("", response_model=Page[ResearchOut])
def list_research(
    params: ListQuery,
    filters: Annotated[ResearchFilters, Query()],
    user: CurrentUser,
    db: DbSession,
) -> Page[ResearchOut]:
    return service.list_research(db, user, params, filters)


@router.post("", status_code=201, response_model=ResearchOut)
def create_research(body: ResearchCreate, user: CurrentUser, db: DbSession) -> ResearchOpportunity:
    return service.create_research(db, user, body)


@router.get("/{research_id}", response_model=ResearchOut)
def get_research(research_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ResearchOpportunity:
    return service.get_research(db, user, research_id)


@router.patch("/{research_id}", response_model=ResearchOut)
def update_research(
    research_id: uuid.UUID, body: ResearchUpdate, user: CurrentUser, db: DbSession
) -> ResearchOpportunity:
    return service.update_research(db, user, research_id, body)


@router.delete("/{research_id}", status_code=204)
def delete_research(research_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    service.delete_research(db, user, research_id)
