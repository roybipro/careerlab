import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import CurrentUser, DbSession, require_csrf
from app.core.lists import ListQuery, Page
from app.modules.jobs import service
from app.modules.jobs.models import JobApplication
from app.modules.jobs.schemas import JobCreate, JobFilters, JobOut, JobUpdate

router = APIRouter(prefix="/jobs", tags=["jobs"], dependencies=[Depends(require_csrf)])


@router.get("", response_model=Page[JobOut])
def list_jobs(
    params: ListQuery, filters: Annotated[JobFilters, Query()], user: CurrentUser, db: DbSession
) -> Page[JobOut]:
    return service.list_jobs(db, user, params, filters)


@router.post("", status_code=201, response_model=JobOut)
def create_job(body: JobCreate, user: CurrentUser, db: DbSession) -> JobApplication:
    return service.create_job(db, user, body)


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: uuid.UUID, user: CurrentUser, db: DbSession) -> JobApplication:
    return service.get_job(db, user, job_id)


@router.patch("/{job_id}", response_model=JobOut)
def update_job(
    job_id: uuid.UUID, body: JobUpdate, user: CurrentUser, db: DbSession
) -> JobApplication:
    return service.update_job(db, user, job_id, body)


@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    service.delete_job(db, user, job_id)
