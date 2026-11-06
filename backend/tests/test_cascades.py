import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.activity.models import ActivityLog
from app.modules.auth.models import User
from app.modules.contacts.models import Contact, ContactLink
from app.modules.jobs import service as jobs_service
from app.modules.jobs.models import JobApplication
from app.modules.notes.models import Note
from app.modules.reminders.models import Reminder
from tests.conftest import engine, register_user

API = "/api/v1"


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


def due() -> str:
    return (datetime.now(UTC) + timedelta(days=1)).isoformat()


def attach(c: TestClient, entity_type: str, entity_id: str) -> dict:
    """Give a record one note, one reminder and one linked contact (if linkable)."""
    ids: dict = {}
    ids["note"] = c.post(
        f"{API}/notes", json={"entity_type": entity_type, "entity_id": entity_id, "content": "n"}
    ).json()["id"]
    ids["reminder"] = c.post(
        f"{API}/reminders",
        json={
            "title": f"r-{entity_type}",
            "due_at": due(),
            "related_type": entity_type,
            "related_id": entity_id,
        },
    ).json()["id"]
    if entity_type != "contact":
        contact = c.post(f"{API}/contacts", json={"name": f"Contact for {entity_type}"}).json()
        r = c.post(
            f"{API}/contacts/{contact['id']}/links",
            json={"entity_type": entity_type, "entity_id": entity_id},
        )
        assert r.status_code == 201, r.text
        ids["contact"] = contact["id"]
    return ids


def counts(db: Session) -> dict[str, int]:
    return {
        model.__tablename__: db.scalar(select(func.count()).select_from(model)) or 0
        for model in (Note, Reminder, ContactLink, Contact)
    }


def test_delete_job_removes_notes_reminders_links_keeps_contact_and_activity(ana, db):
    job = ana.post(f"{API}/jobs", json={"company_name": "Acme", "position_title": "Eng"}).json()
    other = ana.post(f"{API}/jobs", json={"company_name": "Other", "position_title": "Dev"}).json()
    ids = attach(ana, "job", job["id"])
    attach(ana, "job", other["id"])
    assert counts(db) == {"notes": 2, "reminders": 2, "contact_links": 2, "contacts": 2}

    assert ana.delete(f"{API}/jobs/{job['id']}").status_code == 204

    # Only the deleted job's dependents are gone; the other job's are untouched.
    assert counts(db) == {"notes": 1, "reminders": 1, "contact_links": 1, "contacts": 2}
    assert ana.get(f"{API}/contacts/{ids['contact']}").json()["links"] == []
    notes = ana.get(f"{API}/notes").json()["items"]
    assert [n["entity_id"] for n in notes] == [other["id"]]
    events = ana.get(
        f"{API}/activity",
        params={"entity_type": "job", "entity_id": job["id"], "sort": "created_at"},
    ).json()["items"]
    assert [e["action"] for e in events] == ["created", "contact_added", "deleted"]


def test_delete_research_same_behaviour(ana, db):
    item = ana.post(f"{API}/research", json={"title": "RA", "organization": "ETH"}).json()
    ids = attach(ana, "research", item["id"])
    assert counts(db) == {"notes": 1, "reminders": 1, "contact_links": 1, "contacts": 1}

    assert ana.delete(f"{API}/research/{item['id']}").status_code == 204

    assert counts(db) == {"notes": 0, "reminders": 0, "contact_links": 0, "contacts": 1}
    assert ana.get(f"{API}/contacts/{ids['contact']}").status_code == 200
    events = ana.get(
        f"{API}/activity", params={"entity_type": "research", "entity_id": item["id"]}
    ).json()["items"]
    assert "deleted" in [e["action"] for e in events]


def test_delete_contact_removes_its_notes_reminders_links(ana, db):
    job = ana.post(f"{API}/jobs", json={"company_name": "Acme", "position_title": "Eng"}).json()
    contact = ana.post(f"{API}/contacts", json={"name": "Maya"}).json()
    other = ana.post(f"{API}/contacts", json={"name": "Sam"}).json()
    attach(ana, "contact", contact["id"])
    attach(ana, "contact", other["id"])
    for c in (contact, other):
        ana.post(
            f"{API}/contacts/{c['id']}/links", json={"entity_type": "job", "entity_id": job["id"]}
        )
    assert counts(db) == {"notes": 2, "reminders": 2, "contact_links": 2, "contacts": 2}

    assert ana.delete(f"{API}/contacts/{contact['id']}").status_code == 204

    assert counts(db) == {"notes": 1, "reminders": 1, "contact_links": 1, "contacts": 1}
    assert ana.get(f"{API}/jobs/{job['id']}").status_code == 200  # the job survives
    assert (
        db.scalar(select(func.count()).select_from(Note).where(Note.entity_id == contact["id"]))
        == 0
    )


def test_deleted_item_activity_keeps_label(ana):
    job = ana.post(f"{API}/jobs", json={"company_name": "Acme", "position_title": "Eng"}).json()
    research = ana.post(f"{API}/research", json={"title": "RA", "organization": "ETH"}).json()
    contact = ana.post(f"{API}/contacts", json={"name": "Maya Chen"}).json()
    attach(ana, "job", job["id"])
    ana.delete(f"{API}/jobs/{job['id']}")
    ana.delete(f"{API}/research/{research['id']}")
    ana.delete(f"{API}/contacts/{contact['id']}")

    def deleted_label(entity_type: str, entity_id: str) -> str:
        items = ana.get(
            f"{API}/activity", params={"entity_type": entity_type, "entity_id": entity_id}
        ).json()["items"]
        (event,) = [e for e in items if e["action"] == "deleted"]
        return event["metadata"]["label"]

    assert deleted_label("job", job["id"]) == "Eng at Acme"
    assert deleted_label("research", research["id"]) == "RA (ETH)"
    assert deleted_label("contact", contact["id"]) == "Maya Chen"
    # Dependent records are gone but the history of the job is still readable.
    events = ana.get(f"{API}/activity", params={"entity_type": "job", "entity_id": job["id"]})
    assert events.json()["total"] >= 3


def test_other_users_records_survive_delete(ana, second_client, db):
    bobs_job = second_client.post(
        f"{API}/jobs", json={"company_name": "B", "position_title": "B"}
    ).json()
    attach(second_client, "job", bobs_job["id"])
    mine = ana.post(f"{API}/jobs", json={"company_name": "A", "position_title": "A"}).json()
    attach(ana, "job", mine["id"])
    assert ana.delete(f"{API}/jobs/{mine['id']}").status_code == 204
    assert counts(db) == {"notes": 1, "reminders": 1, "contact_links": 1, "contacts": 2}
    assert second_client.get(f"{API}/notes").json()["total"] == 1


def test_failed_delete_leaves_job_and_dependents_in_place(ana, db, monkeypatch):
    job = ana.post(f"{API}/jobs", json={"company_name": "Acme", "position_title": "Eng"}).json()
    attach(ana, "job", job["id"])
    user = db.scalar(select(User))

    def boom(*_args, **_kwargs):
        raise RuntimeError("cascade failed")

    # Dependents are removed first, so failing the job delete proves they roll back together.
    monkeypatch.setattr(db, "delete", boom)
    with pytest.raises(RuntimeError):
        jobs_service.delete_job(db, user, uuid.UUID(job["id"]))
    db.rollback()

    with Session(engine) as fresh:
        assert counts(fresh) == {"notes": 1, "reminders": 1, "contact_links": 1, "contacts": 1}
        assert fresh.get(JobApplication, uuid.UUID(job["id"])) is not None
        actions = fresh.scalars(
            select(ActivityLog.action).where(ActivityLog.entity_id == uuid.UUID(job["id"]))
        ).all()
        assert "deleted" not in actions
