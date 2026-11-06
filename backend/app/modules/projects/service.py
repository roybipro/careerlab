import uuid
from collections.abc import Sequence
from datetime import UTC, date, datetime
from typing import Any, cast

from sqlalchemy import ColumnElement, Select, Subquery, func, literal, select, union_all
from sqlalchemy.orm import Session

from app.core.errors import not_found
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
    ProjectCreate,
    ProjectFilters,
    ProjectOut,
    ProjectUpdate,
)

ENTITY = "project"

SORT_FIELDS = {
    "created_at": ResearchProject.created_at,
    "updated_at": ResearchProject.updated_at,
    "title": ResearchProject.title,
    "target_date": ResearchProject.target_date,
}


# Open research items. The dashboard (summary, upcoming and overdue lists) and the project's
# next deadline all read these two definitions, so they cannot disagree.


def active_project_clause() -> ColumnElement[bool]:
    """True for a project whose stage is neither published nor paused."""
    return ResearchProject.stage.notin_(INACTIVE_STAGES)


def planned_submission_deadlines(user: User) -> Subquery:
    """Each abstract and paper deadline of a `planned` submission in an active project.

    Columns: project_id, item_id (the submission), title (the venue), due, field.
    """

    def part(column: Any, field: str) -> Select[Any]:
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
            )
        )

    return union_all(
        part(ProjectSubmission.abstract_deadline, "abstract_deadline"),
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


def _today() -> date:
    return datetime.now(UTC).date()


def _counts(db: Session, user: User, ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, dict[str, Any]]:
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
        .where(open_items.c.project_id.in_(ids), open_items.c.due >= _today())
        .group_by(open_items.c.project_id)
    ):
        result[project_id].update(next_deadline=due)
    return result


def _out(db: Session, user: User, projects: Sequence[ResearchProject]) -> list[ProjectOut]:
    counts = _counts(db, user, [p.id for p in projects])
    return [ProjectOut.model_validate(p).model_copy(update=counts[p.id]) for p in projects]


def list_projects(
    db: Session, user: User, params: ListParams, filters: ProjectFilters
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
        items=_out(db, user, page.items),
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


def read_project(db: Session, user: User, project_id: uuid.UUID) -> ProjectOut:
    return _out(db, user, [get_project(db, user, project_id)])[0]


def create_project(db: Session, user: User, data: ProjectCreate) -> ProjectOut:
    project = ResearchProject(user_id=user.id, **data.model_dump())
    db.add(project)
    db.flush()
    log_activity(db, user, ENTITY, project.id, "created", project_label(project))
    db.commit()
    return _out(db, user, [project])[0]


def update_project(
    db: Session, user: User, project_id: uuid.UUID, data: ProjectUpdate
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
    return _out(db, user, [project])[0]


def delete_project(db: Session, user: User, project_id: uuid.UUID) -> None:
    project = get_project(db, user, project_id)
    log_activity(db, user, ENTITY, project.id, "deleted", project_label(project))
    delete_dependents(db, user, ENTITY, project.id)
    db.delete(project)
    db.commit()
