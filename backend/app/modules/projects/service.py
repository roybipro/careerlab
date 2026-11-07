import uuid
from collections.abc import Sequence
from datetime import UTC, date, datetime
from typing import Any, cast

from sqlalchemy import ColumnElement, Select, Subquery, func, literal, select, union_all
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.core.lists import ListParams, Page, contains, paginate
from app.modules.activity.service import log_activity
from app.modules.auth.models import User
from app.modules.entities import delete_dependents, project_label
from app.modules.projects.models import (
    INACTIVE_STAGES,
    ProjectMilestone,
    ProjectSubmission,
    ResearchProject,
    SubmissionStatus,
)
from app.modules.projects.schemas import (
    MilestoneCreate,
    MilestoneUpdate,
    ProjectCreate,
    ProjectFilters,
    ProjectOut,
    ProjectUpdate,
    SubmissionCreate,
    SubmissionUpdate,
)

ENTITY = "project"

SORT_FIELDS = {
    "created_at": ResearchProject.created_at,
    "updated_at": ResearchProject.updated_at,
    "title": ResearchProject.title,
    "target_date": ResearchProject.target_date,
}


# Open research items: the definitions below are shared by a project's next deadline and the
# dashboard (Task 3), which should read them too. Both take "today" from the client's local date.


def active_project_clause() -> ColumnElement[bool]:
    """True for a project whose stage is neither published nor paused."""
    return ResearchProject.stage.notin_(INACTIVE_STAGES)


def planned_submission_deadlines(user: User) -> Subquery:
    """Each abstract and paper deadline of a `planned` submission in an active project.

    An abstract deadline is left out once `abstract_submitted_on` is set.

    Columns: project_id, item_id (the submission), title (the venue), due, field.
    """

    def part(column: Any, field: str, *extra: ColumnElement[bool]) -> Select[Any]:
        return (
            select(
                ProjectSubmission.project_id.label("project_id"),
                ProjectSubmission.id.label("item_id"),
                ProjectSubmission.venue_name.label("title"),
                column.label("due"),
                literal(field).label("field"),
            )
            .join(ResearchProject, ResearchProject.id == ProjectSubmission.project_id)
            .where(
                ProjectSubmission.user_id == user.id,
                ProjectSubmission.status == SubmissionStatus.planned,
                column.is_not(None),
                active_project_clause(),
                *extra,
            )
        )

    return union_all(
        # An abstract stops being an open item once it is marked submitted.
        part(
            ProjectSubmission.abstract_deadline,
            "abstract_deadline",
            ProjectSubmission.abstract_submitted_on.is_(None),
        ),
        part(ProjectSubmission.paper_deadline, "paper_deadline"),
    ).subquery("planned_submission_deadlines")


def open_milestones(user: User) -> Select[Any]:
    """Undone milestones with a due date, in an active project.

    Columns: project_id, item_id (the milestone), title, due.
    """
    stmt = (
        select(
            ProjectMilestone.project_id.label("project_id"),
            ProjectMilestone.id.label("item_id"),
            ProjectMilestone.title.label("title"),
            ProjectMilestone.due_date.label("due"),
        )
        .join(ResearchProject, ResearchProject.id == ProjectMilestone.project_id)
        .where(
            ProjectMilestone.user_id == user.id,
            ProjectMilestone.is_done.is_(False),
            ProjectMilestone.due_date.is_not(None),
            active_project_clause(),
        )
    )
    return cast("Select[Any]", stmt)


def _counts(
    db: Session, user: User, ids: Sequence[uuid.UUID], today: date
) -> dict[uuid.UUID, dict[str, Any]]:
    """Counts and next deadline for a page of projects, in a fixed number of queries."""
    if not ids:
        return {}
    result: dict[uuid.UUID, dict[str, Any]] = {i: {} for i in ids}

    milestone_rows = db.execute(
        select(
            ProjectMilestone.project_id,
            func.count(),
            func.count().filter(ProjectMilestone.is_done.is_(True)),
        )
        .where(ProjectMilestone.user_id == user.id, ProjectMilestone.project_id.in_(ids))
        .group_by(ProjectMilestone.project_id)
    ).all()
    for project_id, total, done in milestone_rows:
        result[project_id].update(milestones_total=total, milestones_done=done)

    for project_id, total in db.execute(
        select(ProjectSubmission.project_id, func.count())
        .where(ProjectSubmission.user_id == user.id, ProjectSubmission.project_id.in_(ids))
        .group_by(ProjectSubmission.project_id)
    ):
        result[project_id].update(submissions_total=total)

    submissions = planned_submission_deadlines(user)
    milestones = open_milestones(user).subquery("open_milestones")
    open_items = union_all(
        select(submissions.c.project_id, submissions.c.due),
        select(milestones.c.project_id, milestones.c.due),
    ).subquery("open_items")
    for project_id, due in db.execute(
        select(open_items.c.project_id, func.min(open_items.c.due))
        .where(open_items.c.project_id.in_(ids), open_items.c.due >= today)
        .group_by(open_items.c.project_id)
    ):
        result[project_id].update(next_deadline=due)
    return result


def _out(
    db: Session, user: User, projects: Sequence[ResearchProject], today: date
) -> list[ProjectOut]:
    counts = _counts(db, user, [p.id for p in projects], today)
    return [ProjectOut.model_validate(p).model_copy(update=counts[p.id]) for p in projects]


def list_projects(
    db: Session, user: User, params: ListParams, filters: ProjectFilters, today: date
) -> Page[ProjectOut]:
    stmt = select(ResearchProject).where(ResearchProject.user_id == user.id)
    if params.q:
        stmt = stmt.where(
            contains(ResearchProject.title, params.q)
            | contains(ResearchProject.topic, params.q)
            | contains(ResearchProject.institution, params.q)
        )
    if filters.stage:
        stmt = stmt.where(ResearchProject.stage == filters.stage)
    if filters.project_type:
        stmt = stmt.where(ResearchProject.project_type == filters.project_type)
    if filters.active:
        stmt = stmt.where(active_project_clause())
    page = paginate(db, stmt, params, SORT_FIELDS, "-created_at")
    return Page(
        items=_out(db, user, page.items, today),
        total=page.total,
        page=page.page,
        page_size=page.page_size,
    )


def get_project(db: Session, user: User, project_id: uuid.UUID) -> ResearchProject:
    project = db.scalar(
        select(ResearchProject).where(
            ResearchProject.id == project_id, ResearchProject.user_id == user.id
        )
    )
    if project is None:
        raise not_found()
    return project


def read_project(db: Session, user: User, project_id: uuid.UUID, today: date) -> ProjectOut:
    return _out(db, user, [get_project(db, user, project_id)], today)[0]


def create_project(db: Session, user: User, data: ProjectCreate, today: date) -> ProjectOut:
    project = ResearchProject(user_id=user.id, **data.model_dump())
    db.add(project)
    db.flush()
    log_activity(db, user, ENTITY, project.id, "created", project_label(project))
    db.commit()
    return _out(db, user, [project], today)[0]


def update_project(
    db: Session, user: User, project_id: uuid.UUID, data: ProjectUpdate, today: date
) -> ProjectOut:
    project = get_project(db, user, project_id)
    # exclude_unset: omitted fields stay as stored, explicit nulls clear them.
    changes = {
        k: v for k, v in data.model_dump(exclude_unset=True).items() if getattr(project, k) != v
    }
    if changes:
        old_stage = project.stage
        for field, value in changes.items():
            setattr(project, field, value)
        if "stage" in changes:
            log_activity(
                db,
                user,
                ENTITY,
                project.id,
                "stage_changed",
                project_label(project),
                old=old_stage.value,
                new=project.stage.value,
            )
        db.commit()
    return _out(db, user, [project], today)[0]


def delete_project(db: Session, user: User, project_id: uuid.UUID) -> None:
    project = get_project(db, user, project_id)
    log_activity(db, user, ENTITY, project.id, "deleted", project_label(project))
    delete_dependents(db, user, ENTITY, project.id)
    db.delete(project)
    db.commit()


# --- Submissions and milestones -------------------------------------------------------------

SUBMISSION_SORT_FIELDS = {
    "created_at": ProjectSubmission.created_at,
    "venue_name": ProjectSubmission.venue_name,
    "status": ProjectSubmission.status,
    "abstract_deadline": ProjectSubmission.abstract_deadline,
    "paper_deadline": ProjectSubmission.paper_deadline,
}

MILESTONE_SORT_FIELDS = {
    "due_date": ProjectMilestone.due_date,
    "created_at": ProjectMilestone.created_at,
    "title": ProjectMilestone.title,
}


def list_submissions(
    db: Session, user: User, project_id: uuid.UUID, params: ListParams
) -> Page[Any]:
    get_project(db, user, project_id)
    stmt = select(ProjectSubmission).where(
        ProjectSubmission.user_id == user.id, ProjectSubmission.project_id == project_id
    )
    if params.q:
        stmt = stmt.where(contains(ProjectSubmission.venue_name, params.q))
    return paginate(db, stmt, params, SUBMISSION_SORT_FIELDS, "created_at")


def _get_submission(
    db: Session, user: User, project_id: uuid.UUID, submission_id: uuid.UUID
) -> ProjectSubmission:
    submission = db.scalar(
        select(ProjectSubmission).where(
            ProjectSubmission.id == submission_id,
            ProjectSubmission.project_id == project_id,
            ProjectSubmission.user_id == user.id,
        )
    )
    if submission is None:
        raise not_found()
    return submission


def _check_deadline_order(abstract: date | None, paper: date | None) -> None:
    if abstract is not None and paper is not None and abstract > paper:
        raise AppError(
            422,
            "validation_error",
            "Request validation failed",
            [
                {
                    "loc": ["body", "abstract_deadline"],
                    "message": "abstract_deadline must not be after paper_deadline",
                    "type": "value_error",
                }
            ],
        )


def create_submission(
    db: Session, user: User, project_id: uuid.UUID, data: SubmissionCreate
) -> ProjectSubmission:
    project = get_project(db, user, project_id)
    submission = ProjectSubmission(user_id=user.id, project_id=project.id, **data.model_dump())
    db.add(submission)
    db.flush()
    log_activity(
        db,
        user,
        ENTITY,
        project.id,
        "submission_added",
        project_label(project),
        venue=submission.venue_name,
    )
    db.commit()
    return submission


def update_submission(
    db: Session,
    user: User,
    project_id: uuid.UUID,
    submission_id: uuid.UUID,
    data: SubmissionUpdate,
) -> ProjectSubmission:
    project = get_project(db, user, project_id)
    submission = _get_submission(db, user, project_id, submission_id)
    changes = {
        k: v for k, v in data.model_dump(exclude_unset=True).items() if getattr(submission, k) != v
    }
    if changes:
        # Stored values merged with the patch, so a patch of one deadline is checked too.
        _check_deadline_order(
            changes.get("abstract_deadline", submission.abstract_deadline),
            changes.get("paper_deadline", submission.paper_deadline),
        )
        old_status = submission.status
        for field, value in changes.items():
            setattr(submission, field, value)
        if "status" in changes:
            log_activity(
                db,
                user,
                ENTITY,
                project.id,
                "submission_status_changed",
                project_label(project),
                venue=submission.venue_name,
                old=old_status.value,
                new=submission.status.value,
            )
        db.commit()
    return submission


def delete_submission(
    db: Session, user: User, project_id: uuid.UUID, submission_id: uuid.UUID
) -> None:
    get_project(db, user, project_id)
    db.delete(_get_submission(db, user, project_id, submission_id))
    db.commit()


def list_milestones(
    db: Session, user: User, project_id: uuid.UUID, params: ListParams
) -> Page[Any]:
    get_project(db, user, project_id)
    stmt = select(ProjectMilestone).where(
        ProjectMilestone.user_id == user.id, ProjectMilestone.project_id == project_id
    )
    if params.q:
        stmt = stmt.where(contains(ProjectMilestone.title, params.q))
    if params.sort is None:
        # Due date with undated last, then creation time. `paginate` appends its own keys.
        stmt = stmt.order_by(
            ProjectMilestone.due_date.asc().nulls_last(), ProjectMilestone.created_at
        )
    return paginate(db, stmt, params, MILESTONE_SORT_FIELDS, "due_date")


def _get_milestone(
    db: Session, user: User, project_id: uuid.UUID, milestone_id: uuid.UUID
) -> ProjectMilestone:
    milestone = db.scalar(
        select(ProjectMilestone).where(
            ProjectMilestone.id == milestone_id,
            ProjectMilestone.project_id == project_id,
            ProjectMilestone.user_id == user.id,
        )
    )
    if milestone is None:
        raise not_found()
    return milestone


def _log_completed(db: Session, user: User, project: ResearchProject, title: str) -> None:
    log_activity(
        db, user, ENTITY, project.id, "milestone_completed", project_label(project), milestone=title
    )


def create_milestone(
    db: Session, user: User, project_id: uuid.UUID, data: MilestoneCreate
) -> ProjectMilestone:
    project = get_project(db, user, project_id)
    milestone = ProjectMilestone(user_id=user.id, project_id=project.id, **data.model_dump())
    if milestone.is_done:
        milestone.completed_at = datetime.now(UTC)
    db.add(milestone)
    db.flush()
    if milestone.is_done:
        _log_completed(db, user, project, milestone.title)
    db.commit()
    return milestone


def update_milestone(
    db: Session,
    user: User,
    project_id: uuid.UUID,
    milestone_id: uuid.UUID,
    data: MilestoneUpdate,
) -> ProjectMilestone:
    project = get_project(db, user, project_id)
    milestone = _get_milestone(db, user, project_id, milestone_id)
    changes = {
        k: v for k, v in data.model_dump(exclude_unset=True).items() if getattr(milestone, k) != v
    }
    if changes:
        for field, value in changes.items():
            setattr(milestone, field, value)
        if "is_done" in changes:
            # Only a real change of state touches completed_at, so ticking twice keeps it.
            milestone.completed_at = datetime.now(UTC) if milestone.is_done else None
            if milestone.is_done:
                _log_completed(db, user, project, milestone.title)
        db.commit()
    return milestone


def delete_milestone(
    db: Session, user: User, project_id: uuid.UUID, milestone_id: uuid.UUID
) -> None:
    get_project(db, user, project_id)
    db.delete(_get_milestone(db, user, project_id, milestone_id))
    db.commit()
