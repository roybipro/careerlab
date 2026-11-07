import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import ClientToday, CurrentUser, DbSession, require_csrf
from app.core.lists import ListQuery, Page
from app.modules.projects import service
from app.modules.projects.models import ProjectMilestone, ProjectSubmission
from app.modules.projects.schemas import (
    MilestoneCreate,
    MilestoneOut,
    MilestoneUpdate,
    ProjectCreate,
    ProjectFilters,
    ProjectOut,
    ProjectUpdate,
    SubmissionCreate,
    SubmissionOut,
    SubmissionUpdate,
)

router = APIRouter(prefix="/projects", tags=["projects"], dependencies=[Depends(require_csrf)])


@router.get("", response_model=Page[ProjectOut])
def list_projects(
    params: ListQuery,
    filters: Annotated[ProjectFilters, Query()],
    user: CurrentUser,
    db: DbSession,
    today: ClientToday,
) -> Page[ProjectOut]:
    return service.list_projects(db, user, params, filters, today)


@router.post("", status_code=201, response_model=ProjectOut)
def create_project(
    body: ProjectCreate, user: CurrentUser, db: DbSession, today: ClientToday
) -> ProjectOut:
    return service.create_project(db, user, body, today)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: uuid.UUID, user: CurrentUser, db: DbSession, today: ClientToday
) -> ProjectOut:
    return service.read_project(db, user, project_id, today)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    user: CurrentUser,
    db: DbSession,
    today: ClientToday,
) -> ProjectOut:
    return service.update_project(db, user, project_id, body, today)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    service.delete_project(db, user, project_id)


@router.get("/{project_id}/submissions", response_model=Page[SubmissionOut])
def list_submissions(
    project_id: uuid.UUID, params: ListQuery, user: CurrentUser, db: DbSession
) -> Page[SubmissionOut]:
    return service.list_submissions(db, user, project_id, params)


@router.post("/{project_id}/submissions", status_code=201, response_model=SubmissionOut)
def create_submission(
    project_id: uuid.UUID, body: SubmissionCreate, user: CurrentUser, db: DbSession
) -> ProjectSubmission:
    return service.create_submission(db, user, project_id, body)


@router.patch("/{project_id}/submissions/{submission_id}", response_model=SubmissionOut)
def update_submission(
    project_id: uuid.UUID,
    submission_id: uuid.UUID,
    body: SubmissionUpdate,
    user: CurrentUser,
    db: DbSession,
) -> ProjectSubmission:
    return service.update_submission(db, user, project_id, submission_id, body)


@router.delete("/{project_id}/submissions/{submission_id}", status_code=204)
def delete_submission(
    project_id: uuid.UUID, submission_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> None:
    service.delete_submission(db, user, project_id, submission_id)


@router.get("/{project_id}/milestones", response_model=Page[MilestoneOut])
def list_milestones(
    project_id: uuid.UUID, params: ListQuery, user: CurrentUser, db: DbSession
) -> Page[MilestoneOut]:
    return service.list_milestones(db, user, project_id, params)


@router.post("/{project_id}/milestones", status_code=201, response_model=MilestoneOut)
def create_milestone(
    project_id: uuid.UUID, body: MilestoneCreate, user: CurrentUser, db: DbSession
) -> ProjectMilestone:
    return service.create_milestone(db, user, project_id, body)


@router.patch("/{project_id}/milestones/{milestone_id}", response_model=MilestoneOut)
def update_milestone(
    project_id: uuid.UUID,
    milestone_id: uuid.UUID,
    body: MilestoneUpdate,
    user: CurrentUser,
    db: DbSession,
) -> ProjectMilestone:
    return service.update_milestone(db, user, project_id, milestone_id, body)


@router.delete("/{project_id}/milestones/{milestone_id}", status_code=204)
def delete_milestone(
    project_id: uuid.UUID, milestone_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> None:
    service.delete_milestone(db, user, project_id, milestone_id)
