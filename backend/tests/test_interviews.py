from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from tests.conftest import register_user

API = "/api/v1"


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


def make_job(c: TestClient, **fields) -> dict:
    r = c.post(f"{API}/jobs", json={"company_name": "Acme", "position_title": "Engineer", **fields})
    assert r.status_code == 201, r.text
    return r.json()


def rounds(job_id: str) -> str:
    return f"{API}/jobs/{job_id}/interviews"


def at(**delta) -> str:
    return (datetime.now(UTC) + timedelta(**delta)).isoformat()


def test_create_defaults_and_list_order(ana):
    job = make_job(ana)
    later = ana.post(rounds(job["id"]), json={"title": "Onsite", "scheduled_at": at(days=9)})
    undated = ana.post(rounds(job["id"]), json={"title": "Take-home"})
    sooner = ana.post(rounds(job["id"]), json={"title": "Screen", "scheduled_at": at(days=2)})
    assert later.status_code == undated.status_code == sooner.status_code == 201
    body = undated.json()
    assert body["interview_type"] == "other" and body["outcome"] == "pending"
    assert body["thank_you_sent"] is False and body["rating"] is None
    titles = [r["title"] for r in ana.get(rounds(job["id"])).json()]
    assert titles == ["Screen", "Onsite", "Take-home"]


def test_update_and_clear_fields(ana):
    job = make_job(ana)
    r = ana.post(
        rounds(job["id"]),
        json={
            "title": "Tech",
            "interview_type": "technical",
            "duration_minutes": 60,
            "location": "https://meet.example/x",
            "interviewers": "Dana (EM)",
        },
    ).json()
    url = f"{rounds(job['id'])}/{r['id']}"
    patched = ana.patch(
        url,
        json={"outcome": "passed", "rating": 4, "thank_you_sent": True, "questions": "LRU cache"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["outcome"] == "passed" and patched.json()["rating"] == 4
    cleared = ana.patch(url, json={"location": None, "rating": None}).json()
    assert cleared["location"] is None and cleared["rating"] is None
    assert cleared["interviewers"] == "Dana (EM)"


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"title": "  "},
        {"title": "x", "interview_type": "nope"},
        {"title": "x", "outcome": "maybe"},
        {"title": "x", "rating": 0},
        {"title": "x", "rating": 6},
        {"title": "x", "duration_minutes": 2},
        {"title": "x", "scheduled_at": "2026-12-01T10:00:00"},  # no time zone
        {"title": "x", "location": "a" * 501},
    ],
)
def test_validation(ana, body):
    job = make_job(ana)
    assert ana.post(rounds(job["id"]), json=body).status_code == 422


def test_required_fields_cannot_be_nulled(ana):
    job = make_job(ana)
    r = ana.post(rounds(job["id"]), json={"title": "x"}).json()
    url = f"{rounds(job['id'])}/{r['id']}"
    for field in ("title", "interview_type", "outcome", "thank_you_sent"):
        assert ana.patch(url, json={field: None}).status_code == 422, field


def test_scheduling_logs_activity(ana):
    job = make_job(ana)
    ana.post(rounds(job["id"]), json={"title": "Screen", "scheduled_at": at(days=3)})
    activity = ana.get(
        f"{API}/activity", params={"entity_type": "job", "entity_id": job["id"]}
    ).json()["items"]
    assert any(a["action"] == "interview_scheduled" for a in activity)


def test_isolation_and_wrong_job(ana, second_client):
    job = make_job(ana)
    other_job = make_job(ana, company_name="Other")
    r = ana.post(rounds(job["id"]), json={"title": "Screen"}).json()
    url = f"{rounds(job['id'])}/{r['id']}"
    assert second_client.get(rounds(job["id"])).status_code == 404
    assert second_client.post(rounds(job["id"]), json={"title": "x"}).status_code == 404
    assert second_client.patch(url, json={"title": "Hacked"}).status_code == 404
    assert second_client.delete(url).status_code == 404
    # A round is only reachable under its own job.
    assert ana.patch(f"{rounds(other_job['id'])}/{r['id']}", json={"title": "y"}).status_code == 404
    assert ana.get(rounds(job["id"])).json()[0]["title"] == "Screen"


def test_delete_round_and_job_cascade(ana, db):
    from sqlalchemy import func, select

    from app.modules.interviews.models import JobInterview

    job = make_job(ana)
    a = ana.post(rounds(job["id"]), json={"title": "A"}).json()
    ana.post(rounds(job["id"]), json={"title": "B"})
    assert ana.delete(f"{rounds(job['id'])}/{a['id']}").status_code == 204
    assert [r["title"] for r in ana.get(rounds(job["id"])).json()] == ["B"]
    assert ana.delete(f"{API}/jobs/{job['id']}").status_code == 204
    assert db.scalar(select(func.count()).select_from(JobInterview)) == 0


def test_rounds_in_calendar_feed(ana, app):
    job = make_job(ana)
    ana.post(
        rounds(job["id"]),
        json={
            "title": "Onsite",
            "scheduled_at": at(days=4),
            "duration_minutes": 90,
            "location": "HQ",
        },
    )
    ana.post(
        rounds(job["id"]),
        json={"title": "Dropped", "scheduled_at": at(days=5), "outcome": "cancelled"},
    )
    path = ana.post(f"{API}/calendar/feed").json()["path"]
    with TestClient(app) as anon:
        ics = anon.get(path).text.replace("\r\n ", "")
    assert "SUMMARY:Interview: Onsite (Acme: Engineer)" in ics
    assert "DESCRIPTION:HQ" in ics
    assert "Dropped" not in ics
