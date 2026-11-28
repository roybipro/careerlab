import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.modules.activity.service import log_activity
from app.modules.auth.models import User
from app.modules.entities import job_label
from app.modules.interviews.models import JobInterview
from app.modules.interviews.schemas import InterviewCreate, InterviewUpdate
from app.modules.jobs.models import JobApplication
from app.modules.jobs.service import get_job

# A job's rounds are listed in full; this only stops runaway growth.
MAX_INTERVIEWS_PER_JOB = 100


def _get(db: Session, user: User, job_id: uuid.UUID, interview_id: uuid.UUID) -> JobInterview:
    interview = db.scalar(
        select(JobInterview).where(
            JobInterview.id == interview_id,
            JobInterview.job_id == job_id,
            JobInterview.user_id == user.id,
        )
    )
    if interview is None:
        raise not_found()
    return interview


def _log_scheduled(db: Session, user: User, job: JobApplication, interview: JobInterview) -> None:
    assert interview.scheduled_at is not None
    log_activity(
        db,
        user,
        "job",
        job.id,
        "interview_scheduled",
        job_label(job),
        interview_at=interview.scheduled_at.isoformat(),
        round=interview.title,
    )


def list_interviews(db: Session, user: User, job_id: uuid.UUID) -> Sequence[JobInterview]:
    get_job(db, user, job_id)
    return db.scalars(
        select(JobInterview)
        .where(JobInterview.user_id == user.id, JobInterview.job_id == job_id)
        # Scheduled rounds in date order, then undated ones in the order they were added.
        .order_by(
            JobInterview.scheduled_at.asc().nulls_last(), JobInterview.created_at, JobInterview.id
        )
        .limit(MAX_INTERVIEWS_PER_JOB)
    ).all()


def create_interview(
    db: Session, user: User, job_id: uuid.UUID, data: InterviewCreate
) -> JobInterview:
    job = get_job(db, user, job_id)
    count = db.scalar(
        select(func.count())
        .select_from(JobInterview)
        .where(JobInterview.user_id == user.id, JobInterview.job_id == job.id)
    )
    if (count or 0) >= MAX_INTERVIEWS_PER_JOB:
        raise AppError(
            422, "too_many", f"A job can have at most {MAX_INTERVIEWS_PER_JOB} interview rounds"
        )
    interview = JobInterview(user_id=user.id, job_id=job.id, **data.model_dump())
    db.add(interview)
    db.flush()
    if interview.scheduled_at is not None:
        _log_scheduled(db, user, job, interview)
    db.commit()
    return interview


def update_interview(
    db: Session, user: User, job_id: uuid.UUID, interview_id: uuid.UUID, data: InterviewUpdate
) -> JobInterview:
    job = get_job(db, user, job_id)
    interview = _get(db, user, job_id, interview_id)
    changes = {
        k: v for k, v in data.model_dump(exclude_unset=True).items() if getattr(interview, k) != v
    }
    if changes:
        for field, value in changes.items():
            setattr(interview, field, value)
        if changes.get("scheduled_at") is not None:
            _log_scheduled(db, user, job, interview)
        db.commit()
    return interview


def delete_interview(db: Session, user: User, job_id: uuid.UUID, interview_id: uuid.UUID) -> None:
    get_job(db, user, job_id)
    db.delete(_get(db, user, job_id, interview_id))
    db.commit()
