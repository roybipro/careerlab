import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from app.core.deps import CurrentUser, DbSession, require_csrf
from app.core.lists import ListQuery, Page
from app.modules.activity import service
from app.modules.activity.schemas import ActivityOut

router = APIRouter(prefix="/activity", tags=["activity"], dependencies=[Depends(require_csrf)])


@router.get("", response_model=Page[ActivityOut])
def list_activity(
    params: ListQuery,
    user: CurrentUser,
    db: DbSession,
    entity_type: Annotated[Literal["job", "research", "project", "contact"] | None, Query()] = None,
    entity_id: Annotated[uuid.UUID | None, Query()] = None,
) -> Page[ActivityOut]:
    return service.list_activity(db, user, params, entity_type, entity_id)
