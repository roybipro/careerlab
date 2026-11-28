import uuid
from collections.abc import Sequence

from fastapi import APIRouter, Depends

from app.core.deps import CurrentUser, DbSession, require_csrf
from app.modules.interviews import service
from app.modules.interviews.models import JobInterview
from app.modules.interviews.schemas import InterviewCreate, InterviewOut, InterviewUpdate

router = APIRouter(prefix="/jobs", tags=["interviews"], dependencies=[Depends(require_csrf)])


@router.get("/{job_id}/interviews", response_model=list[InterviewOut])
def list_interviews(job_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Sequence[JobInterview]:
    return service.list_interviews(db, user, job_id)


@router.post("/{job_id}/interviews", status_code=201, response_model=InterviewOut)
def create_interview(
    job_id: uuid.UUID, body: InterviewCreate, user: CurrentUser, db: DbSession
) -> JobInterview:
    return service.create_interview(db, user, job_id, body)


@router.patch("/{job_id}/interviews/{interview_id}", response_model=InterviewOut)
def update_interview(
    job_id: uuid.UUID,
    interview_id: uuid.UUID,
    body: InterviewUpdate,
    user: CurrentUser,
    db: DbSession,
) -> JobInterview:
    return service.update_interview(db, user, job_id, interview_id, body)


@router.delete("/{job_id}/interviews/{interview_id}", status_code=204)
def delete_interview(
    job_id: uuid.UUID, interview_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> None:
    service.delete_interview(db, user, job_id, interview_id)
