import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.core.lists import ListParams, Page, contains, iso, paginate
from app.modules.activity.service import log_activity
from app.modules.auth.models import User
from app.modules.entities import delete_dependents, job_label
from app.modules.jobs.models import INTERNSHIP_TYPES, JobApplication
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
    "start_date": JobApplication.start_date,
}


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


def _check_dates(start_date: date | None, end_date: date | None) -> None:
    if start_date is not None and end_date is not None and end_date < start_date:
        raise AppError(
            422,
            "validation_error",
            "end_date cannot be before start_date",
            [
                {
                    "loc": ["body", "end_date"],
                    "message": "end_date cannot be before start_date",
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
    if filters.employment_type:
        stmt = stmt.where(JobApplication.employment_type == filters.employment_type)
    if filters.source:
        stmt = stmt.where(JobApplication.source == filters.source)
    if filters.category == "internships":
        stmt = stmt.where(JobApplication.employment_type.in_(INTERNSHIP_TYPES))
    elif filters.category == "jobs":
        # NOT IN is unknown for a null type, so a record with no type is matched explicitly.
        stmt = stmt.where(
            JobApplication.employment_type.is_(None)
            | JobApplication.employment_type.not_in(INTERNSHIP_TYPES)
        )
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
    _check_dates(data.start_date, data.end_date)
    job = JobApplication(user_id=user.id, **data.model_dump())
    db.add(job)
    db.flush()
    log_activity(db, user, "job", job.id, "created", job_label(job))
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
    _check_dates(changes.get("start_date", job.start_date), changes.get("end_date", job.end_date))
    old = {k: getattr(job, k) for k in changes}
    for field, value in changes.items():
        setattr(job, field, value)

    label = job_label(job)
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
    log_activity(db, user, "job", job.id, "deleted", job_label(job))
    delete_dependents(db, user, "job", job.id)
    db.delete(job)
    db.commit()
