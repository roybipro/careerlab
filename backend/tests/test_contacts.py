import uuid
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from tests.conftest import register_user
from tests.isolation import assert_isolated

CONTACTS = "/api/v1/contacts"
JOBS = "/api/v1/jobs"
RESEARCH = "/api/v1/research"
ACTIVITY = "/api/v1/activity"


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


def make_contact(c: TestClient, **fields) -> dict:
    r = c.post(CONTACTS, json={"name": "Dr. Maya Chen", **fields})
    assert r.status_code == 201, r.text
    return r.json()


def make_job(c: TestClient, **fields) -> dict:
    r = c.post(JOBS, json={"company_name": "Acme", "position_title": "Engineer", **fields})
    assert r.status_code == 201, r.text
    return r.json()


def make_research(c: TestClient, **fields) -> dict:
    r = c.post(RESEARCH, json={"title": "Vision Lab RA", "organization": "ETH", **fields})
    assert r.status_code == 201, r.text
    return r.json()


def link(c: TestClient, contact_id: str, entity_type: str, entity_id: str):
    return c.post(
        f"{CONTACTS}/{contact_id}/links", json={"entity_type": entity_type, "entity_id": entity_id}
    )


def names(c: TestClient, **params) -> list[str]:
    r = c.get(CONTACTS, params=params)
    assert r.status_code == 200, r.text
    return [i["name"] for i in r.json()["items"]]


def test_contact_crud_and_filters(ana):
    maya = make_contact(
        ana,
        email="maya@uni.edu",
        organization="ETH Zurich",
        contact_type="professor",
        linkedin_url="https://linkedin.com/in/maya",
    )
    assert maya["contact_type"] == "professor"
    assert maya["links"] == [] and "user_id" not in maya
    make_contact(ana, name="Sam Ortiz", contact_type="recruiter", organization="Acme")

    url = f"{CONTACTS}/{maya['id']}"
    assert ana.get(url).json()["name"] == "Dr. Maya Chen"

    r = ana.patch(url, json={"position": "Professor", "email": None})
    assert r.status_code == 200 and r.json()["position"] == "Professor"
    assert r.json()["email"] is None and r.json()["organization"] == "ETH Zurich"
    assert ana.patch(url, json={"name": None}).status_code == 422
    assert ana.patch(url, json={"linkedin_url": "javascript:alert(1)"}).status_code == 422
    assert ana.post(CONTACTS, json={}).status_code == 422

    assert sorted(names(ana)) == ["Dr. Maya Chen", "Sam Ortiz"]
    assert names(ana, contact_type="recruiter") == ["Sam Ortiz"]
    assert names(ana, q="eth") == ["Dr. Maya Chen"]
    assert names(ana, sort="-name") == ["Sam Ortiz", "Dr. Maya Chen"]
    assert ana.get(CONTACTS, params={"contact_type": "bogus"}).status_code == 422
    assert ana.get(CONTACTS, params={"sort": "bogus"}).status_code == 422
    body = ana.get(CONTACTS, params={"page_size": 1}).json()
    assert body["total"] == 2 and len(body["items"]) == 1 and "links" not in body["items"][0]

    assert ana.delete(url).status_code == 204
    assert ana.get(url).status_code == 404
    assert names(ana) == ["Sam Ortiz"]


def test_search_q_treats_percent_and_underscore_literally(ana):
    for org in ("50% Club", "500 Club", "a_b Labs", "axb Labs"):
        make_contact(ana, name=f"Contact at {org}", organization=org)
    assert names(ana, q="50%") == ["Contact at 50% Club"]
    assert names(ana, q="a_b") == ["Contact at a_b Labs"]


def test_contacts_isolated(ana, second_client):
    contact = make_contact(ana)
    job = make_job(ana)
    assert_isolated(ana, second_client, f"{CONTACTS}/{contact['id']}", {"name": "Hacked"})
    assert second_client.get(CONTACTS).json()["total"] == 0

    # The other user can neither link to nor unlink from the owner's contact.
    assert link(second_client, contact["id"], "job", job["id"]).status_code == 404
    created = link(ana, contact["id"], "job", job["id"]).json()
    r = second_client.delete(f"{CONTACTS}/{contact['id']}/links/{created['id']}")
    assert r.status_code == 404
    assert len(ana.get(f"{CONTACTS}/{contact['id']}").json()["links"]) == 1


def test_link_contact_to_job_logs_contact_added_on_job(ana):
    contact = make_contact(ana)
    job = make_job(ana)
    research = make_research(ana)

    r = link(ana, contact["id"], "job", job["id"])
    assert r.status_code == 201, r.text
    assert r.json()["label"] == "Engineer at Acme"
    assert r.json()["entity_type"] == "job" and r.json()["entity_id"] == job["id"]
    assert link(ana, contact["id"], "research", research["id"]).status_code == 201

    detail = ana.get(f"{CONTACTS}/{contact['id']}").json()
    assert {(x["entity_type"], x["label"]) for x in detail["links"]} == {
        ("job", "Engineer at Acme"),
        ("research", "Vision Lab RA (ETH)"),
    }
    assert all(set(x) == {"id", "entity_type", "entity_id", "label"} for x in detail["links"])

    events = ana.get(
        ACTIVITY, params={"entity_type": "job", "entity_id": job["id"], "sort": "created_at"}
    ).json()["items"]
    assert [e["action"] for e in events] == ["created", "contact_added"]
    assert events[1]["metadata"]["contact_name"] == "Dr. Maya Chen"
    assert events[1]["metadata"]["label"] == "Engineer at Acme"

    # Removing the link leaves the contact and the history.
    link_id = detail["links"][0]["id"]
    assert ana.delete(f"{CONTACTS}/{contact['id']}/links/{link_id}").status_code == 204
    assert len(ana.get(f"{CONTACTS}/{contact['id']}").json()["links"]) == 1
    assert ana.delete(f"{CONTACTS}/{contact['id']}/links/{link_id}").status_code == 404


def test_duplicate_link_returns_409(ana):
    contact = make_contact(ana)
    job = make_job(ana)
    assert link(ana, contact["id"], "job", job["id"]).status_code == 201
    r = link(ana, contact["id"], "job", job["id"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "conflict"
    assert len(ana.get(f"{CONTACTS}/{contact['id']}").json()["links"]) == 1
    events = ana.get(ACTIVITY, params={"entity_type": "job", "entity_id": job["id"]}).json()
    assert [e["action"] for e in events["items"]].count("contact_added") == 1
    # The same job can link a second, different contact.
    other = make_contact(ana, name="Sam")
    assert link(ana, other["id"], "job", job["id"]).status_code == 201


def test_link_to_another_users_job_returns_404(ana, second_client):
    bobs_job = make_job(second_client)
    bobs_research = make_research(second_client)
    contact = make_contact(ana)
    assert link(ana, contact["id"], "job", bobs_job["id"]).status_code == 404
    assert link(ana, contact["id"], "research", bobs_research["id"]).status_code == 404
    assert link(ana, contact["id"], "job", str(uuid.uuid4())).status_code == 404
    # A job id is not a research id.
    own_job = make_job(ana)
    assert link(ana, contact["id"], "research", own_job["id"]).status_code == 404
    assert link(ana, contact["id"], "contact", contact["id"]).status_code == 422
    assert ana.get(f"{CONTACTS}/{contact['id']}").json()["links"] == []
    assert (
        second_client.get(
            ACTIVITY, params={"entity_type": "job", "entity_id": bobs_job["id"]}
        ).json()["total"]
        == 1
    )  # only Bob's own "created"


def test_filter_contacts_by_linked_entity_and_follow_up_due(ana):
    today = date.today()
    job = make_job(ana)
    research = make_research(ana)
    overdue = make_contact(ana, name="Overdue", next_follow_up_at=str(today - timedelta(days=3)))
    due_today = make_contact(ana, name="Today", next_follow_up_at=str(today))
    make_contact(ana, name="Future", next_follow_up_at=str(today + timedelta(days=3)))
    make_contact(ana, name="NoDate")
    link(ana, overdue["id"], "job", job["id"])
    link(ana, due_today["id"], "research", research["id"])

    assert sorted(names(ana, follow_up_due="true")) == ["Overdue", "Today"]
    assert len(names(ana, follow_up_due="false")) == 4
    assert names(ana, entity_type="job", entity_id=job["id"]) == ["Overdue"]
    assert names(ana, entity_type="research", entity_id=research["id"]) == ["Today"]
    assert names(ana, entity_type="job", entity_id=research["id"]) == []
    assert names(ana, entity_type="job", entity_id=job["id"], follow_up_due="true") == ["Overdue"]
    assert ana.get(CONTACTS, params={"entity_type": "contact"}).status_code == 422
