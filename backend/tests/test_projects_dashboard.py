"""Research items on the dashboard: upcoming deadlines, the summary and overdue items.

Service tests inject a fixed `now`; API tests send the client's local date as `today`.
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.auth.models import User
from app.modules.dashboard import service
from app.modules.projects.models import (
    ProjectMilestone,
    ProjectStage,
    ProjectSubmission,
    ResearchProject,
    SubmissionStatus,
)
from tests.conftest import register_user

DASHBOARD = "/api/v1/dashboard"
NOW = datetime(2026, 11, 6, 12, 0, tzinfo=UTC)
TODAY = NOW.date()
RESEARCH_KINDS = {"project_submission_deadline", "project_milestone"}


def days(n: int) -> date:
    return TODAY + timedelta(days=n)


def make_user(db: Session, email: str = "ana@x.com") -> User:
    user = User(full_name="Ana Lima", email=email, password_hash="x")
    db.add(user)
    db.commit()
    return user


def make_project(
    db: Session, user: User, stage: ProjectStage = ProjectStage.writing, title: str = "Sparse Study"
) -> ResearchProject:
    project = ResearchProject(user_id=user.id, title=title, stage=stage)
    db.add(project)
    db.commit()
    return project


def make_sub(db: Session, project: ResearchProject, **fields: Any) -> ProjectSubmission:
    fields.setdefault("venue_name", "Northfield Symposium")
    sub = ProjectSubmission(user_id=project.user_id, project_id=project.id, **fields)
    db.add(sub)
    db.commit()
    return sub


def make_milestone(db: Session, project: ResearchProject, **fields: Any) -> ProjectMilestone:
    fields.setdefault("title", "Draft results")
    row = ProjectMilestone(user_id=project.user_id, project_id=project.id, **fields)
    db.add(row)
    db.commit()
    return row


def research_items(db: Session, user: User, today: date = TODAY) -> list[dict[str, Any]]:
    items = service.upcoming_deadlines(db, user, now=NOW, today=today)
    return [i for i in items if i["kind"] in RESEARCH_KINDS]


def count(db: Session, user: User) -> int:
    return service.summary(db, user, now=NOW, today=TODAY)["upcoming_deadlines"]


@pytest.mark.parametrize(("offset", "counts"), [(-1, False), (0, True), (14, True), (15, False)])
@pytest.mark.parametrize("item", ["abstract", "paper", "milestone"])
def test_upcoming_boundaries_day_0_14_15(db, item, offset, counts):
    user = make_user(db)
    project = make_project(db, user)
    if item == "milestone":
        make_milestone(db, project, due_date=days(offset))
    else:
        make_sub(db, project, **{f"{item}_deadline": days(offset)})
    assert len(research_items(db, user)) == (1 if counts else 0)
    assert count(db, user) == (1 if counts else 0)


def test_abstract_and_paper_count_as_two_items(db):
    user = make_user(db)
    project = make_project(db, user, title="Graph Study")
    sub = make_sub(db, project, abstract_deadline=days(3), paper_deadline=days(10))
    items = research_items(db, user)
    assert [(i["kind"], i["id"], i["due"]) for i in items] == [
        ("project_submission_deadline", sub.id, days(3)),
        ("project_submission_deadline", sub.id, days(10)),
    ]
    assert {i["title"] for i in items} == {
        "Northfield Symposium abstract",
        "Northfield Symposium paper",
    }
    assert all(i["project_id"] == project.id for i in items)
    assert all(i["project_title"] == "Graph Study" for i in items)
    assert all(i["related_type"] == "project" and i["related_id"] == project.id for i in items)
    assert count(db, user) == 2


def test_past_abstract_is_overdue_while_future_paper_is_upcoming(db):
    user = make_user(db)
    project = make_project(db, user)
    make_sub(db, project, abstract_deadline=days(-2), paper_deadline=days(5))
    upcoming = research_items(db, user)
    assert [i["title"] for i in upcoming] == ["Northfield Symposium paper"]
    overdue = service.overdue_research(db, user, now=NOW, today=TODAY)
    assert [(i["title"], i["due"]) for i in overdue] == [
        ("Northfield Symposium abstract", days(-2))
    ]
    assert count(db, user) == 1


def test_submission_leaving_planned_stops_counting(db):
    user = make_user(db)
    project = make_project(db, user)
    sub = make_sub(db, project, abstract_deadline=days(-1), paper_deadline=days(4))
    assert count(db, user) == 1
    assert len(service.overdue_research(db, user, now=NOW, today=TODAY)) == 1
    sub.status = SubmissionStatus.submitted
    db.commit()
    assert count(db, user) == 0
    assert research_items(db, user) == []
    assert service.overdue_research(db, user, now=NOW, today=TODAY) == []


def test_done_milestone_stops_counting(db):
    user = make_user(db)
    project = make_project(db, user)
    milestone = make_milestone(db, project, due_date=days(2))
    assert count(db, user) == 1
    milestone.is_done = True
    db.commit()
    assert count(db, user) == 0
    assert research_items(db, user) == []


def test_milestone_with_no_due_date_never_counts(db):
    user = make_user(db)
    make_milestone(db, make_project(db, user), due_date=None)
    assert count(db, user) == 0
    assert research_items(db, user) == []
    assert service.overdue_research(db, user, now=NOW, today=TODAY) == []


@pytest.mark.parametrize("stage", [ProjectStage.paused, ProjectStage.published])
def test_paused_and_published_projects_excluded_then_return_when_resumed(db, stage):
    user = make_user(db)
    project = make_project(db, user, stage=stage)
    make_sub(db, project, paper_deadline=days(3), abstract_deadline=days(-3))
    make_milestone(db, project, due_date=days(4))
    assert count(db, user) == 0
    assert research_items(db, user) == []
    assert service.overdue_research(db, user, now=NOW, today=TODAY) == []

    project.stage = ProjectStage.experiments
    db.commit()
    assert count(db, user) == 2
    assert len(research_items(db, user)) == 2
    assert len(service.overdue_research(db, user, now=NOW, today=TODAY)) == 1


def test_summary_count_equals_list_length_with_research_items(db):
    user = make_user(db)
    project = make_project(db, user)
    make_sub(db, project, abstract_deadline=days(0), paper_deadline=days(14))
    make_sub(db, project, venue_name="Other Venue", paper_deadline=days(15))
    make_milestone(db, project, due_date=days(7))
    make_milestone(db, project, due_date=days(20))
    all_items = service.upcoming_deadlines(db, user, now=NOW, today=TODAY)
    assert len(all_items) == 3
    assert count(db, user) == len(all_items)


def test_active_research_projects_count(db):
    user = make_user(db)
    for stage in ProjectStage:
        make_project(db, user, stage=stage)
    other = make_user(db, "bob@x.com")
    make_project(db, other)
    summary = service.summary(db, user, now=NOW, today=TODAY)
    assert summary["active_research_projects"] == len(ProjectStage) - 2


def test_overdue_oldest_first_capped_at_50_and_today_is_not_overdue(db):
    user = make_user(db)
    project = make_project(db, user)
    for n in range(1, 56):
        make_milestone(db, project, title=f"Step {n}", due_date=days(-n))
    make_milestone(db, project, title="Due today", due_date=days(0))
    make_milestone(db, project, title="Later", due_date=days(1))
    overdue = service.overdue_research(db, user, now=NOW, today=TODAY)
    assert len(overdue) == 50
    dues = [i["due"] for i in overdue]
    assert dues == sorted(dues)
    assert dues[0] == days(-55)
    assert dues[-1] == days(-6)
    assert all(i["kind"] == "project_milestone" for i in overdue)
    assert "Due today" not in {i["title"] for i in overdue}


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


def _project_with_items(c: TestClient, anchor: date) -> str:
    r = c.post("/api/v1/projects", json={"title": "Sparse Attention Study", "stage": "writing"})
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    r = c.post(
        f"/api/v1/projects/{pid}/submissions",
        json={"venue_name": "Northfield Symposium", "paper_deadline": anchor.isoformat()},
    )
    assert r.status_code == 201, r.text
    r = c.post(
        f"/api/v1/projects/{pid}/milestones",
        json={"title": "Run ablations", "due_date": (anchor - timedelta(days=30)).isoformat()},
    )
    assert r.status_code == 201, r.text
    return pid


def test_today_parameter_applies_to_research_items(ana):
    utc_today = datetime.now(UTC).date()
    west = utc_today - timedelta(days=1)  # a browser west of UTC
    pid = _project_with_items(ana, west)

    params = {"today": west.isoformat()}
    items = ana.get(f"{DASHBOARD}/upcoming-deadlines", params=params).json()
    assert [(i["kind"], i["due"], i["title"]) for i in items] == [
        ("project_submission_deadline", west.isoformat(), "Northfield Symposium paper")
    ]
    assert items[0]["project_id"] == pid
    assert items[0]["project_title"] == "Sparse Attention Study"
    assert ana.get(f"{DASHBOARD}/summary", params=params).json()["upcoming_deadlines"] == 1
    assert ana.get(f"{DASHBOARD}/summary").json()["upcoming_deadlines"] == 0

    # Seen from the UTC date, that paper deadline is yesterday: overdue, and so is the milestone.
    overdue = ana.get(f"{DASHBOARD}/overdue-research").json()
    assert [i["title"] for i in overdue] == ["Run ablations", "Northfield Symposium paper"]
    assert set(overdue[0]) == {"kind", "id", "title", "due", "project_id", "project_title"}
    assert overdue[0]["kind"] == "project_milestone"
    assert overdue[0]["project_id"] == pid
    # From the client's date, the paper deadline is today and not overdue.
    seen = ana.get(f"{DASHBOARD}/overdue-research", params=params).json()
    assert [i["title"] for i in seen] == ["Run ablations"]


@pytest.mark.parametrize("path", ["summary", "upcoming-deadlines", "overdue-research"])
@pytest.mark.parametrize("offset", [-2, 2])
def test_out_of_range_today_returns_422(ana, path, offset):
    bad = (datetime.now(UTC).date() + timedelta(days=offset)).isoformat()
    r = ana.get(f"{DASHBOARD}/{path}", params={"today": bad})
    assert r.status_code == 422
    assert r.json()["error"]["details"][0]["loc"] == ["query", "today"]


def test_existing_kinds_carry_null_project_fields(ana):
    due = (datetime.now(UTC).date() + timedelta(days=2)).isoformat()
    r = ana.post(
        "/api/v1/jobs",
        json={
            "company_name": "Acme",
            "position_title": "Dev",
            "deadline": due,
            "status": "applied",
        },
    )
    assert r.status_code == 201, r.text
    [item] = ana.get(f"{DASHBOARD}/upcoming-deadlines").json()
    assert item["kind"] == "job_deadline"
    assert item["project_id"] is None
    assert item["project_title"] is None
    assert item["related_type"] == "job"


def test_overdue_requires_login(client):
    r = client.get(f"{DASHBOARD}/overdue-research")
    assert r.status_code == 401


def test_dashboard_excludes_other_users_research_items(db):
    ana = make_user(db)
    bob = make_user(db, "bob@x.com")
    project = make_project(db, bob)
    make_sub(db, project, abstract_deadline=days(-3), paper_deadline=days(3))
    make_milestone(db, project, due_date=days(2))
    make_milestone(db, project, due_date=days(-2))
    assert count(db, ana) == 0
    assert research_items(db, ana) == []
    assert service.overdue_research(db, ana, now=NOW, today=TODAY) == []
    assert service.summary(db, ana, now=NOW, today=TODAY)["active_research_projects"] == 0
    assert count(db, bob) == 2
    assert len(service.overdue_research(db, bob, now=NOW, today=TODAY)) == 2
    assert uuid.UUID(int=0) not in {i["id"] for i in research_items(db, bob)}
