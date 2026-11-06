import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.core.lists import ListParams, Page, contains, iso, paginate
from app.modules.activity.service import log_activity
from app.modules.auth.models import User
from app.modules.jobs.models import JobApplication
from app.modules.jobs.schemas import JobCreate, JobFilters, JobUpdate

SORT_FIELDS = {
    "created_at": JobApplication.created_at,
    "updated_at": JobApplication.updated_at,
    "company_name": JobApplication.company_name,
    "position_title": JobApplication.position_title,
    "application_date": JobApplication.application_date,
    "deadline": JobApplication.deadline,
    "follow_up_date": JobApplication.follow_up_date,
    "interview_at": JobApplication.interview_at,
}


def _label(job: JobApplication) -> str:
    return f"{job.position_title} at {job.company_name}"


def _check_salary(salary_min: int | None, salary_max: int | None) -> None:
    if salary_min is not None and salary_max is not None and salary_min > salary_max:
        raise AppError(
            422,
            "validation_error",
            "salary_min cannot be greater than salary_max",
            [
                {
                    "loc": ["body", "salary_min"],
                    "message": "salary_min cannot be greater than salary_max",
                    "type": "value_error",
                }
            ],
        )


def list_jobs(db: Session, user: User, params: ListParams, filters: JobFilters) -> Page[Any]:
    stmt = select(JobApplication).where(JobApplication.user_id == user.id)
    if params.q:
        stmt = stmt.where(
            contains(JobApplication.company_name, params.q)
            | contains(JobApplication.position_title, params.q)
            | contains(JobApplication.location, params.q)
        )
    if filters.company:
        stmt = stmt.where(contains(JobApplication.company_name, filters.company))
    if filters.position:
        stmt = stmt.where(contains(JobApplication.position_title, filters.position))
    if filters.status:
        stmt = stmt.where(JobApplication.status == filters.status)
    if filters.priority:
        stmt = stmt.where(JobApplication.priority == filters.priority)
    if filters.job_type:
        stmt = stmt.where(JobApplication.job_type == filters.job_type)
    for column, low, high in (
        (
            JobApplication.application_date,
            filters.application_date_from,
            filters.application_date_to,
        ),
        (JobApplication.deadline, filters.deadline_from, filters.deadline_to),
    ):
        if low:
            stmt = stmt.where(column >= low)
        if high:
            stmt = stmt.where(column <= high)
    return paginate(db, stmt, params, SORT_FIELDS, "-created_at")


def get_job(db: Session, user: User, job_id: uuid.UUID) -> JobApplication:
    job = db.scalar(
        select(JobApplication).where(JobApplication.id == job_id, JobApplication.user_id == user.id)
    )
    if job is None:
        raise not_found()
    return job


def create_job(db: Session, user: User, data: JobCreate) -> JobApplication:
    _check_salary(data.salary_min, data.salary_max)
    job = JobApplication(user_id=user.id, **data.model_dump())
    db.add(job)
    db.flush()
    log_activity(db, user, "job", job.id, "created", _label(job))
    db.commit()
    return job


def update_job(db: Session, user: User, job_id: uuid.UUID, data: JobUpdate) -> JobApplication:
    job = get_job(db, user, job_id)
    # exclude_unset: omitted fields stay as stored, explicit nulls clear them.
    changes = {k: v for k, v in data.model_dump(exclude_unset=True).items() if getattr(job, k) != v}
    if not changes:
        return job

    _check_salary(
        changes.get("salary_min", job.salary_min), changes.get("salary_max", job.salary_max)
    )
    old = {k: getattr(job, k) for k in changes}
    for field, value in changes.items():
        setattr(job, field, value)

    label = _label(job)
    if "status" in changes:
        log_activity(
            db, user, "job", job.id, "status_changed", label, old=old["status"], new=job.status
        )
    if "deadline" in changes:
        log_activity(
            db,
            user,
            "job",
            job.id,
            "deadline_updated",
            label,
            old=iso(old["deadline"]),
            new=iso(job.deadline),
        )
    if changes.get("interview_at") is not None:
        log_activity(
            db,
            user,
            "job",
            job.id,
            "interview_scheduled",
            label,
            interview_at=iso(job.interview_at),
        )
    db.commit()
    return job


def delete_job(db: Session, user: User, job_id: uuid.UUID) -> None:
    job = get_job(db, user, job_id)
    log_activity(db, user, "job", job.id, "deleted", _label(job))
    db.delete(job)
    db.commit()
