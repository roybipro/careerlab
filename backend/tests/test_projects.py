import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from app.modules.auth.models import User
from app.modules.projects.models import (
    ProjectMilestone,
    ProjectSubmission,
)
from tests.conftest import engine, register_user
from tests.isolation import assert_isolated

PROJECTS = "/api/v1/projects"
ACTIVITY = "/api/v1/activity"
NOTES = "/api/v1/notes"
REMINDERS = "/api/v1/reminders"
CONTACTS = "/api/v1/contacts"


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


def make_project(c: TestClient, **fields) -> dict:
    r = c.post(PROJECTS, json={"title": "Sparse Attention Study", **fields})
    assert r.status_code == 201, r.text
    return r.json()


def activity_for(c: TestClient, project_id: str) -> list[dict]:
    r = c.get(
        ACTIVITY,
        params={"entity_type": "project", "entity_id": project_id, "sort": "created_at"},
    )
    assert r.status_code == 200, r.text
    return r.json()["items"]


def today() -> date:
    return datetime.now(UTC).date()


def test_create_defaults_stage_idea_type_personal(ana):
    p = make_project(ana)
    assert p["stage"] == "idea" and p["project_type"] == "personal"
    assert p["topic"] is None and p["target_date"] is None and "user_id" not in p
    assert p["milestones_total"] == 0 and p["milestones_done"] == 0
    assert p["submissions_total"] == 0 and p["next_deadline"] is None


def test_title_required_and_invalid_enum_returns_422(ana):
    assert ana.post(PROJECTS, json={}).status_code == 422
    assert ana.post(PROJECTS, json={"title": "   "}).status_code == 422
    assert ana.post(PROJECTS, json={"title": "T", "stage": "bogus"}).status_code == 422
    assert ana.post(PROJECTS, json={"title": "T", "project_type": "bogus"}).status_code == 422
    p = make_project(ana)
    assert ana.patch(f"{PROJECTS}/{p['id']}", json={"title": None}).status_code == 422
    assert ana.patch(f"{PROJECTS}/{p['id']}", json={"stage": None}).status_code == 422
    assert ana.patch(f"{PROJECTS}/{p['id']}", json={"stage": "bogus"}).status_code == 422
    body = ana.post(PROJECTS, json={"title": "T", "stage": "bogus"}).json()
    assert body["error"]["code"] == "validation_error"


def test_get_update_delete_project(ana):
    p = make_project(ana, topic="Attention", institution="Northfield University")
    url = f"{PROJECTS}/{p['id']}"
    assert ana.get(url).json()["topic"] == "Attention"

    r = ana.patch(url, json={"title": "Renamed", "topic": None, "target_date": "2030-05-01"})
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Renamed" and r.json()["topic"] is None
    assert r.json()["target_date"] == "2030-05-01"
    assert r.json()["institution"] == "Northfield University"

    assert ana.delete(url).status_code == 204
    assert ana.get(url).status_code == 404
    assert ana.get(PROJECTS).json()["total"] == 0


def test_projects_isolated_between_users(ana, second_client):
    p = make_project(ana)
    assert_isolated(ana, second_client, f"{PROJECTS}/{p['id']}", {"title": "Hacked"})
    assert second_client.get(PROJECTS).json()["total"] == 0


def test_filter_by_stage_type_and_active(ana):
    a = make_project(ana, title="A", stage="writing", project_type="thesis")
    b = make_project(ana, title="B", stage="published")
    c = make_project(ana, title="C", stage="paused", project_type="thesis")
    d = make_project(ana, title="D")

    def ids(**params) -> set[str]:
        r = ana.get(PROJECTS, params=params)
        assert r.status_code == 200, r.text
        return {i["id"] for i in r.json()["items"]}

    assert ids(stage="writing") == {a["id"]}
    assert ids(project_type="thesis") == {a["id"], c["id"]}
    assert ids(active="true") == {a["id"], d["id"]}
    assert ids(active="true", project_type="thesis") == {a["id"]}
    assert ids() == {a["id"], b["id"], c["id"], d["id"]}
    assert ids(stage="paused", active="true") == set()
    assert ana.get(PROJECTS, params={"stage": "bogus"}).status_code == 422


def test_search_matches_title_topic_institution_literally(ana):
    pct = make_project(ana, title="Gain of 100% growth")
    under = make_project(ana, title="x", topic="snake_case naming")
    inst = make_project(ana, title="y", institution="Riverbank_College")
    make_project(ana, title="Plain", topic="abc", institution="Elsewhere")

    def ids(q: str) -> set[str]:
        r = ana.get(PROJECTS, params={"q": q})
        assert r.status_code == 200, r.text
        return {i["id"] for i in r.json()["items"]}

    assert ids("%") == {pct["id"]}
    assert ids("_") == {under["id"], inst["id"]}
    assert ids("snake_c") == {under["id"]}
    assert ids("snakeXcase") == set()
    assert ids("riverbank_") == {inst["id"]}
    assert ids("GAIN OF 100%") == {pct["id"]}
    assert len(ids("a")) >= 1


def test_sort_by_target_date_title_and_unknown_sort_returns_422(ana):
    a = make_project(ana, title="Bravo", target_date="2030-03-01")
    b = make_project(ana, title="Alpha", target_date="2030-01-01")
    c = make_project(ana, title="Charlie")

    def order(sort: str) -> list[str]:
        r = ana.get(PROJECTS, params={"sort": sort})
        assert r.status_code == 200, r.text
        return [i["id"] for i in r.json()["items"]]

    assert order("target_date") == [b["id"], a["id"], c["id"]]
    assert order("-target_date") == [a["id"], b["id"], c["id"]]
    assert order("title") == [b["id"], a["id"], c["id"]]
    assert order("-title") == [c["id"], a["id"], b["id"]]
    r = ana.get(PROJECTS, params={"sort": "stage"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


def test_stage_change_logs_old_and_new(ana):
    p = make_project(ana, title="Graph Models")
    url = f"{PROJECTS}/{p['id']}"
    assert ana.patch(url, json={"stage": "writing"}).status_code == 200
    events = activity_for(ana, p["id"])
    assert [e["action"] for e in events] == ["created", "stage_changed"]
    assert events[1]["metadata"] == {"label": "Graph Models", "old": "idea", "new": "writing"}


def test_no_activity_when_patch_changes_nothing(ana):
    p = make_project(ana, topic="Attention")
    url = f"{PROJECTS}/{p['id']}"
    before = ana.get(url).json()
    assert ana.patch(url, json={}).status_code == 200
    assert ana.patch(url, json={"stage": "idea", "topic": "Attention"}).status_code == 200
    assert [e["action"] for e in activity_for(ana, p["id"])] == ["created"]
    assert ana.get(url).json() == before
    # A change that is not a stage change logs nothing either.
    assert ana.patch(url, json={"topic": "Other"}).status_code == 200
    assert [e["action"] for e in activity_for(ana, p["id"])] == ["created"]


def _user(db: Session, email: str = "ana@x.com") -> User:
    return db.scalars(select(User).where(User.email == email)).one()


def _add_submission(db: Session, user: User, project_id: str, **fields) -> ProjectSubmission:
    s = ProjectSubmission(
        user_id=user.id, project_id=uuid.UUID(project_id), venue_name="NeurIPS", **fields
    )
    db.add(s)
    db.commit()
    return s


def _add_milestone(db: Session, user: User, project_id: str, **fields) -> ProjectMilestone:
    m = ProjectMilestone(
        user_id=user.id, project_id=uuid.UUID(project_id), title="Draft intro", **fields
    )
    db.add(m)
    db.commit()
    return m


def test_counts_and_next_deadline(ana, db):
    user = _user(db)
    p = make_project(ana)
    t = today()
    # Ignored: past dates, a done milestone and non-planned submissions.
    _add_milestone(db, user, p["id"], due_date=t - timedelta(days=1))
    _add_milestone(db, user, p["id"], due_date=t + timedelta(days=1), is_done=True)
    _add_submission(db, user, p["id"], status="submitted", paper_deadline=t + timedelta(days=2))
    _add_submission(db, user, p["id"], status="rejected", abstract_deadline=t + timedelta(days=2))
    _add_milestone(db, user, p["id"])  # no due date
    got = ana.get(f"{PROJECTS}/{p['id']}").json()
    assert got["milestones_total"] == 3 and got["milestones_done"] == 1
    assert got["submissions_total"] == 2
    assert got["next_deadline"] is None

    _add_milestone(db, user, p["id"], due_date=t + timedelta(days=9))
    _add_submission(
        db,
        user,
        p["id"],
        status="planned",
        abstract_deadline=t + timedelta(days=5),
        paper_deadline=t + timedelta(days=12),
    )
    got = ana.get(f"{PROJECTS}/{p['id']}").json()
    assert got["next_deadline"] == (t + timedelta(days=5)).isoformat()
    assert got["milestones_total"] == 4 and got["submissions_total"] == 3

    # Today counts; another project's items and a paused project do not.
    _add_milestone(db, user, p["id"], due_date=t)
    other = make_project(ana, title="Other", stage="paused")
    _add_milestone(db, user, other["id"], due_date=t + timedelta(days=1))
    listing = {i["id"]: i for i in ana.get(PROJECTS).json()["items"]}
    assert listing[p["id"]]["next_deadline"] == t.isoformat()
    assert listing[other["id"]]["next_deadline"] is None
    assert listing[other["id"]]["milestones_total"] == 1


def test_list_uses_fixed_query_count(ana, db):
    user = _user(db)

    def statements() -> int:
        seen: list[str] = []

        def count(conn, cursor, statement, *args):
            seen.append(statement)

        event.listen(engine, "before_cursor_execute", count)
        try:
            assert ana.get(PROJECTS, params={"page_size": 100}).status_code == 200
        finally:
            event.remove(engine, "before_cursor_execute", count)
        return len(seen)

    for i in range(2):
        p = make_project(ana, title=f"P{i}")
        _add_milestone(db, user, p["id"], due_date=today())
        _add_submission(db, user, p["id"], paper_deadline=today())
    few = statements()
    assert few >= 3
    for i in range(2, 15):
        p = make_project(ana, title=f"P{i}")
        _add_milestone(db, user, p["id"], due_date=today())
        _add_submission(db, user, p["id"], paper_deadline=today())
    assert ana.get(PROJECTS, params={"page_size": 100}).json()["total"] == 15
    assert statements() == few


def due() -> str:
    return (datetime.now(UTC) + timedelta(days=1)).isoformat()


def test_notes_and_reminders_attach_to_project(ana):
    p = make_project(ana)
    n = ana.post(NOTES, json={"entity_type": "project", "entity_id": p["id"], "content": "Idea"})
    assert n.status_code == 201, n.text
    r = ana.post(
        REMINDERS,
        json={
            "title": "Read paper",
            "due_at": due(),
            "related_type": "project",
            "related_id": p["id"],
        },
    )
    assert r.status_code == 201, r.text
    got = ana.get(NOTES, params={"entity_type": "project", "entity_id": p["id"]}).json()
    assert got["total"] == 1
    got = ana.get(REMINDERS, params={"related_type": "project", "related_id": p["id"]}).json()
    assert got["total"] == 1
    # The dashboard can list a reminder that points at a project.
    up = ana.get("/api/v1/dashboard/upcoming-deadlines")
    assert up.status_code == 200, up.text
    assert up.json()[0]["related_type"] == "project"


def test_cannot_attach_to_other_users_project(ana, second_client):
    p = make_project(ana)
    n = second_client.post(
        NOTES, json={"entity_type": "project", "entity_id": p["id"], "content": "x"}
    )
    assert n.status_code == 404
    r = second_client.post(
        REMINDERS,
        json={
            "title": "x",
            "due_at": due(),
            "related_type": "project",
            "related_id": p["id"],
        },
    )
    assert r.status_code == 404


def test_contact_link_rejects_project_entity(ana):
    p = make_project(ana)
    c = ana.post(CONTACTS, json={"name": "Dr. Mira Okafor"}).json()
    r = ana.post(
        f"{CONTACTS}/{c['id']}/links", json={"entity_type": "project", "entity_id": p["id"]}
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


def test_delete_removes_children_notes_reminders_keeps_activity_label(ana, db):
    user = _user(db)
    p = make_project(ana, title="Kernel Methods")
    keep = make_project(ana, title="Survivor")
    _add_submission(db, user, p["id"])
    _add_milestone(db, user, p["id"])
    _add_milestone(db, user, keep["id"])
    for pid in (p["id"], keep["id"]):
        ana.post(NOTES, json={"entity_type": "project", "entity_id": pid, "content": "n"})
        ana.post(
            REMINDERS,
            json={"title": "r", "due_at": due(), "related_type": "project", "related_id": pid},
        )

    assert ana.delete(f"{PROJECTS}/{p['id']}").status_code == 204

    def count(model) -> int:
        db.expire_all()
        return db.scalar(select(func.count()).select_from(model)) or 0

    assert count(ProjectSubmission) == 0
    assert count(ProjectMilestone) == 1
    assert ana.get(NOTES, params={"entity_id": p["id"]}).json()["total"] == 0
    assert ana.get(REMINDERS, params={"related_id": p["id"]}).json()["total"] == 0
    assert ana.get(NOTES, params={"entity_id": keep["id"]}).json()["total"] == 1
    assert ana.get(REMINDERS, params={"related_id": keep["id"]}).json()["total"] == 1

    events = activity_for(ana, p["id"])
    assert [e["action"] for e in events] == ["created", "deleted"]
    assert events[1]["metadata"]["label"] == "Kernel Methods"


def test_deleted_project_reminder_not_due_anywhere(ana):
    p = make_project(ana)
    r = ana.post(
        REMINDERS,
        json={
            "title": "Submit abstract",
            "due_at": due(),
            "related_type": "project",
            "related_id": p["id"],
        },
    )
    assert r.status_code == 201, r.text
    assert ana.get(REMINDERS, params={"due_within_days": 3}).json()["total"] == 1
    assert len(ana.get("/api/v1/dashboard/upcoming-deadlines").json()) == 1

    assert ana.delete(f"{PROJECTS}/{p['id']}").status_code == 204
    assert ana.get(REMINDERS, params={"due_within_days": 3}).json()["total"] == 0
    assert ana.get("/api/v1/dashboard/upcoming-deadlines").json() == []
