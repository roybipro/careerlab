import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from tests.conftest import register_user

REMINDERS = "/api/v1/reminders"
JOBS = "/api/v1/jobs"
RESEARCH = "/api/v1/research"
CONTACTS = "/api/v1/contacts"


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


def at(**delta) -> str:
    return (datetime.now(UTC) + timedelta(**delta)).isoformat()


def make_reminder(c: TestClient, **fields) -> dict:
    r = c.post(REMINDERS, json={"title": "Follow up", "due_at": at(days=1), **fields})
    assert r.status_code == 201, r.text
    return r.json()


def make_job(c: TestClient) -> dict:
    r = c.post(JOBS, json={"company_name": "Acme", "position_title": "Engineer"})
    assert r.status_code == 201, r.text
    return r.json()


def titles(c: TestClient, **params) -> list[str]:
    r = c.get(REMINDERS, params=params)
    assert r.status_code == 200, r.text
    return [i["title"] for i in r.json()["items"]]


def test_reminder_crud(ana):
    job = make_job(ana)
    r = make_reminder(ana, description="Email recruiter", related_type="job", related_id=job["id"])
    assert r["is_completed"] is False and r["completed_at"] is None
    assert r["related_type"] == "job" and r["related_id"] == job["id"]
    assert "user_id" not in r
    free = make_reminder(ana, title="Standalone")
    assert free["related_type"] is None and free["related_id"] is None

    url = f"{REMINDERS}/{r['id']}"
    patched = ana.patch(url, json={"title": "Call recruiter", "description": None})
    assert patched.status_code == 200
    assert patched.json()["title"] == "Call recruiter" and patched.json()["description"] is None
    assert patched.json()["related_id"] == job["id"]
    assert ana.patch(url, json={"title": None}).status_code == 422
    assert ana.patch(url, json={"due_at": None}).status_code == 422
    assert ana.patch(url, json={"is_completed": None}).status_code == 422
    cleared = ana.patch(url, json={"related_type": None, "related_id": None})
    assert cleared.status_code == 200 and cleared.json()["related_type"] is None
    # One half of the pair is not enough.
    assert ana.patch(url, json={"related_type": "job"}).status_code == 422
    assert (
        ana.post(
            REMINDERS, json={"title": "x", "due_at": at(days=1), "related_type": "job"}
        ).status_code
        == 422
    )
    assert ana.post(REMINDERS, json={"due_at": at(days=1)}).status_code == 422
    assert ana.post(REMINDERS, json={"title": "x"}).status_code == 422

    assert ana.delete(url).status_code == 204
    assert ana.get(REMINDERS).json()["total"] == 1
    assert ana.delete(url).status_code == 404


def test_reminders_isolated(ana, second_client):
    r = make_reminder(ana)
    # There is no GET /reminders/{id}, so the owner's copy is read from the list.
    url = f"{REMINDERS}/{r['id']}"
    assert second_client.patch(url, json={"title": "Hacked"}).status_code == 404
    assert second_client.delete(url).status_code == 404
    assert second_client.get(REMINDERS).json()["total"] == 0
    assert ana.get(REMINDERS).json()["items"] == [r]


def test_completing_reminder_sets_completed_at_and_reopening_clears_it(ana):
    r = make_reminder(ana)
    url = f"{REMINDERS}/{r['id']}"
    done = ana.patch(url, json={"is_completed": True}).json()
    assert done["is_completed"] is True and done["completed_at"] is not None
    completed_at = datetime.fromisoformat(done["completed_at"])
    assert abs(datetime.now(UTC) - completed_at) < timedelta(minutes=1)

    # Completing again keeps the original timestamp.
    again = ana.patch(url, json={"is_completed": True, "title": "Renamed"}).json()
    assert again["completed_at"] == done["completed_at"]

    reopened = ana.patch(url, json={"is_completed": False}).json()
    assert reopened["is_completed"] is False and reopened["completed_at"] is None


def test_state_filters_overdue_upcoming_completed(ana):
    make_reminder(ana, title="Overdue", due_at=at(hours=-2))
    make_reminder(ana, title="Soon", due_at=at(hours=2))
    make_reminder(ana, title="Later", due_at=at(days=30))
    done = make_reminder(ana, title="Done", due_at=at(days=-5))
    ana.patch(f"{REMINDERS}/{done['id']}", json={"is_completed": True})
    future_done = make_reminder(ana, title="DoneEarly", due_at=at(days=2))
    ana.patch(f"{REMINDERS}/{future_done['id']}", json={"is_completed": True})

    assert titles(ana, state="overdue") == ["Overdue"]
    assert titles(ana, state="upcoming") == ["Soon", "Later"]
    assert sorted(titles(ana, state="completed")) == ["Done", "DoneEarly"]
    assert titles(ana) == ["Done", "Overdue", "Soon", "DoneEarly", "Later"]
    assert titles(ana, sort="-due_at")[0] == "Later"
    assert ana.get(REMINDERS, params={"state": "bogus"}).status_code == 422

    job = make_job(ana)
    make_reminder(ana, title="On job", related_type="job", related_id=job["id"])
    assert titles(ana, related_type="job", related_id=job["id"]) == ["On job"]
    assert titles(ana, related_id=job["id"], state="overdue") == []
    assert titles(ana, q="on j") == ["On job"]


def test_due_within_days_returns_incomplete_due_or_overdue(ana):
    make_reminder(ana, title="Overdue", due_at=at(days=-10))
    make_reminder(ana, title="Tomorrow", due_at=at(days=1))
    make_reminder(ana, title="In 3 days", due_at=at(days=2, hours=23))
    make_reminder(ana, title="In 4 days", due_at=at(days=4))
    done = make_reminder(ana, title="Done overdue", due_at=at(days=-1))
    ana.patch(f"{REMINDERS}/{done['id']}", json={"is_completed": True})

    assert titles(ana, due_within_days=3) == ["Overdue", "Tomorrow", "In 3 days"]
    assert titles(ana, due_within_days=0) == ["Overdue"]
    assert "In 4 days" in titles(ana, due_within_days=5)
    assert "Done overdue" not in titles(ana, due_within_days=365)
    assert ana.get(REMINDERS, params={"due_within_days": -1}).status_code == 422
    assert ana.get(REMINDERS, params={"due_within_days": "x"}).status_code == 422


@pytest.mark.parametrize("value", ["2030-01-01T10:00:00", "2030-01-01", "tomorrow"])
def test_reminder_due_at_without_offset_returns_422(ana, value):
    r = ana.post(REMINDERS, json={"title": "x", "due_at": value})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    ok = make_reminder(ana)
    r = ana.patch(f"{REMINDERS}/{ok['id']}", json={"due_at": "2030-01-01T10:00:00"})
    assert r.status_code == 422
    assert ana.get(REMINDERS).json()["total"] == 1


def test_reminder_related_to_another_users_record_returns_404(ana, second_client):
    bobs_job = make_job(second_client)
    bobs_contact = second_client.post(CONTACTS, json={"name": "Bob's contact"}).json()
    bobs_research = second_client.post(RESEARCH, json={"title": "T", "organization": "O"}).json()
    base = {"title": "x", "due_at": at(days=1)}
    for related_type, record in (
        ("job", bobs_job),
        ("contact", bobs_contact),
        ("research", bobs_research),
    ):
        r = ana.post(
            REMINDERS, json={**base, "related_type": related_type, "related_id": record["id"]}
        )
        assert r.status_code == 404, related_type
    missing = {**base, "related_type": "job", "related_id": str(uuid.uuid4())}
    assert ana.post(REMINDERS, json=missing).status_code == 404

    own = make_reminder(ana)
    r = ana.patch(
        f"{REMINDERS}/{own['id']}", json={"related_type": "job", "related_id": bobs_job["id"]}
    )
    assert r.status_code == 404
    assert ana.get(REMINDERS).json()["items"] == [own]
    assert second_client.get(REMINDERS).json()["total"] == 0
