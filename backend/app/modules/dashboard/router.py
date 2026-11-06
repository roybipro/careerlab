from fastapi import APIRouter, Depends

from app.core.deps import ClientToday, CurrentUser, DbSession, require_csrf
from app.modules.activity.models import ActivityLog
from app.modules.activity.schemas import ActivityOut
from app.modules.dashboard import service
from app.modules.dashboard.schemas import AnalyticsOut, DeadlineOut, OverdueResearchOut, SummaryOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(require_csrf)])


@router.get("/summary", response_model=SummaryOut)
def get_summary(user: CurrentUser, db: DbSession, today: ClientToday) -> dict[str, int]:
    return service.summary(db, user, today=today)


@router.get("/upcoming-deadlines", response_model=list[DeadlineOut])
def get_upcoming_deadlines(
    user: CurrentUser, db: DbSession, today: ClientToday
) -> list[dict[str, object]]:
    return service.upcoming_deadlines(db, user, today=today)


@router.get("/overdue-research", response_model=list[OverdueResearchOut])
def get_overdue_research(
    user: CurrentUser, db: DbSession, today: ClientToday
) -> list[dict[str, object]]:
    return service.overdue_research(db, user, today=today)


@router.get("/recent-activities", response_model=list[ActivityOut])
def get_recent_activities(user: CurrentUser, db: DbSession) -> list[ActivityLog]:
    return list(service.recent_activities(db, user))


@router.get("/analytics", response_model=AnalyticsOut)
def get_analytics(user: CurrentUser, db: DbSession) -> dict[str, object]:
    return service.analytics(db, user)
