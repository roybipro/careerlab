from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.modules.jobs.models import JobApplication
from tests.conftest import register_user

API = "/api/v1"
NUDGES = f"{API}/nudges"


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


def day(offset: int) -> str:
    return (date.today() + timedelta(days=offset)).isoformat()


def nudges(c: TestClient) -> list[dict]:
    r = c.get(NUDGES, params={"today": date.today().isoformat()})
    assert r.status_code == 200, r.text
    return r.json()


def job(c: TestClient, **fields) -> dict:
    body = {"company_name": "Acme", "position_title": "Engineer", **fields}
    r = c.post(f"{API}/jobs", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_applied_job_waiting_two_weeks_is_nudged(ana):
    old = job(ana, status="applied", application_date=day(-20))
    job(ana, company_name="Recent", status="applied", application_date=day(-5))
    job(ana, company_name="Wishlist", status="wishlist", application_date=day(-30))
    job(
        ana,
        company_name="Booked",
        status="applied",
        application_date=day(-30),
        follow_up_date=day(3),
    )

    found = nudges(ana)
    assert [(n["kind"], n["id"], n["reason"], n["days"]) for n in found] == [
        ("job", old["id"], "no_reply", 20)
    ]
    assert found[0]["title"] == "Engineer at Acme"


def test_applied_job_without_date_uses_last_edit(ana, db: Session):
    j = job(ana, status="applied")
    assert nudges(ana) == []
    db.execute(
        update(JobApplication)
        .where(JobApplication.id == j["id"])
        .values(updated_at=JobApplication.updated_at - timedelta(days=15))
    )
    db.commit()
    assert [n["id"] for n in nudges(ana)] == [j["id"]]


def test_research_waiting_is_nudged(ana):
    r = ana.post(
        f"{API}/research",
        json={
            "title": "Vision RA",
            "organization": "ETH",
            "status": "applied",
            "application_date": day(-15),
        },
    ).json()
    found = nudges(ana)
    assert [(n["kind"], n["id"], n["title"]) for n in found] == [
        ("research", r["id"], "Vision RA (ETH)")
    ]


def test_quiet_contact_linked_to_active_work(ana):
    active = job(ana)
    closed = job(ana, company_name="Gone", status="rejected")
    linked = ana.post(
        f"{API}/contacts", json={"name": "Dana", "last_contacted_at": day(-70)}
    ).json()
    unlinked = ana.post(
        f"{API}/contacts", json={"name": "Eli", "last_contacted_at": day(-70)}
    ).json()
    only_closed = ana.post(
        f"{API}/contacts", json={"name": "Fay", "last_contacted_at": day(-70)}
    ).json()
    recent = ana.post(f"{API}/contacts", json={"name": "Gus", "last_contacted_at": day(-10)}).json()
    for contact, target in [(linked, active), (only_closed, closed), (recent, active)]:
        r = ana.post(
            f"{API}/contacts/{contact['id']}/links",
            json={"entity_type": "job", "entity_id": target["id"]},
        )
        assert r.status_code == 201, r.text
    assert unlinked  # has no links at all

    found = nudges(ana)
    assert [(n["kind"], n["title"], n["reason"], n["days"]) for n in found] == [
        ("contact", "Dana", "quiet_contact", 70)
    ]


def test_snooze_hides_until_the_day_and_can_be_moved(ana):
    j = job(ana, status="applied", application_date=day(-20))
    today = date.today()
    r = ana.post(
        f"{NUDGES}/snooze",
        params={"today": today.isoformat()},
        json={"entity_type": "job", "entity_id": j["id"], "days": 7},
    )
    assert r.status_code == 204, r.text
    assert nudges(ana) == []
    # Snoozing again replaces the day rather than adding a row.
    r = ana.post(
        f"{NUDGES}/snooze",
        params={"today": today.isoformat()},
        json={"entity_type": "job", "entity_id": j["id"], "days": 1},
    )
    assert r.status_code == 204
    tomorrow = (today + timedelta(days=1)).isoformat()
    shown = ana.get(NUDGES, params={"today": tomorrow}).json()
    assert [n["id"] for n in shown] == [j["id"]]


def test_snooze_validation_and_isolation(ana, second_client):
    j = job(ana, status="applied", application_date=day(-20))
    body = {"entity_type": "job", "entity_id": j["id"]}
    assert second_client.post(f"{NUDGES}/snooze", json=body).status_code == 404
    assert ana.post(f"{NUDGES}/snooze", json={**body, "days": 0}).status_code == 422
    assert ana.post(f"{NUDGES}/snooze", json={**body, "days": 91}).status_code == 422
    assert ana.post(f"{NUDGES}/snooze", json={**body, "entity_type": "project"}).status_code == 422
    assert second_client.get(NUDGES).json() == []
    assert len(nudges(ana)) == 1


def test_deleting_a_record_removes_its_snooze(ana, db: Session):
    from sqlalchemy import func, select

    from app.modules.nudges.models import NudgeSnooze

    j = job(ana, status="applied", application_date=day(-20))
    ana.post(f"{NUDGES}/snooze", json={"entity_type": "job", "entity_id": j["id"]})
    assert db.scalar(select(func.count()).select_from(NudgeSnooze)) == 1
    assert ana.delete(f"{API}/jobs/{j['id']}").status_code == 204
    assert db.scalar(select(func.count()).select_from(NudgeSnooze)) == 0
