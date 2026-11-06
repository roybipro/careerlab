import uuid

import pytest
from fastapi.testclient import TestClient

from tests.conftest import register_user

NOTES = "/api/v1/notes"
JOBS = "/api/v1/jobs"
RESEARCH = "/api/v1/research"
CONTACTS = "/api/v1/contacts"


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


def make_job(c: TestClient) -> dict:
    r = c.post(JOBS, json={"company_name": "Acme", "position_title": "Engineer"})
    assert r.status_code == 201, r.text
    return r.json()


def make_note(c: TestClient, entity_type: str, entity_id: str, **fields) -> dict:
    body = {"entity_type": entity_type, "entity_id": entity_id, "content": "Went well", **fields}
    r = c.post(NOTES, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_note_crud_kinds_and_filters(ana):
    job = make_job(ana)
    research = ana.post(RESEARCH, json={"title": "RA", "organization": "ETH"}).json()
    contact = ana.post(CONTACTS, json={"name": "Maya"}).json()

    plain = make_note(ana, "job", job["id"], content="Applied via referral")
    assert plain["kind"] == "note" and "user_id" not in plain
    feedback = make_note(ana, "job", job["id"], kind="interview_feedback", content="Strong")
    on_research = make_note(ana, "research", research["id"], kind="communication")
    on_contact = make_note(ana, "contact", contact["id"], content="Met at fair")

    def ids(**params) -> set[str]:
        r = ana.get(NOTES, params=params)
        assert r.status_code == 200, r.text
        return {i["id"] for i in r.json()["items"]}

    assert ids() == {plain["id"], feedback["id"], on_research["id"], on_contact["id"]}
    assert ids(entity_type="job", entity_id=job["id"]) == {plain["id"], feedback["id"]}
    assert ids(entity_type="research") == {on_research["id"]}
    assert ids(entity_id=contact["id"]) == {on_contact["id"]}
    assert ids(kind="interview_feedback") == {feedback["id"]}
    assert ids(entity_id=job["id"], kind="note") == {plain["id"]}
    assert ids(q="referral") == {plain["id"]}
    assert ana.get(NOTES, params={"kind": "bogus"}).status_code == 422
    assert ana.get(NOTES, params={"entity_type": "bogus"}).status_code == 422

    url = f"{NOTES}/{plain['id']}"
    r = ana.patch(url, json={"content": "Updated", "kind": "communication"})
    assert r.status_code == 200 and r.json()["content"] == "Updated"
    assert r.json()["kind"] == "communication" and r.json()["entity_id"] == job["id"]
    assert ana.patch(url, json={"content": None}).status_code == 422
    assert ana.patch(url, json={"content": "   "}).status_code == 422
    # A note cannot be moved to another record.
    moved = ana.patch(url, json={"entity_id": research["id"]})
    assert moved.status_code == 200 and moved.json()["entity_id"] == job["id"]

    assert ana.delete(url).status_code == 204
    assert ana.delete(url).status_code == 404
    assert plain["id"] not in ids()
    assert ana.post(NOTES, json={"entity_type": "job", "entity_id": job["id"]}).status_code == 422


def test_notes_isolated(ana, second_client):
    note = make_note(ana, "job", make_job(ana)["id"])
    # There is no GET /notes/{id}, so the owner's copy is read from the list.
    url = f"{NOTES}/{note['id']}"
    assert second_client.patch(url, json={"content": "Hacked"}).status_code == 404
    assert second_client.delete(url).status_code == 404
    assert ana.get(NOTES).json()["items"] == [note]
    assert second_client.get(NOTES).json()["total"] == 0


def test_note_on_another_users_job_returns_404(ana, second_client):
    bobs_job = make_job(second_client)
    for entity_type in ("job", "research", "contact"):
        r = ana.post(
            NOTES,
            json={"entity_type": entity_type, "entity_id": bobs_job["id"], "content": "x"},
        )
        assert r.status_code == 404, entity_type
    missing = {"entity_type": "job", "entity_id": str(uuid.uuid4()), "content": "x"}
    assert ana.post(NOTES, json=missing).status_code == 404
    assert second_client.get(NOTES).json()["total"] == 0
    assert ana.get(NOTES).json()["total"] == 0
