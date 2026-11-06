import pytest
from fastapi.testclient import TestClient

from tests.conftest import register_user
from tests.isolation import assert_isolated

RESEARCH = "/api/v1/research"
ACTIVITY = "/api/v1/activity"


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


def make_research(c: TestClient, **fields) -> dict:
    body = {"title": "Vision Lab RA", "organization": "ETH Zurich", **fields}
    r = c.post(RESEARCH, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def activity_for(c: TestClient, research_id: str) -> list[dict]:
    r = c.get(
        ACTIVITY,
        params={"entity_type": "research", "entity_id": research_id, "sort": "created_at"},
    )
    assert r.status_code == 200, r.text
    return r.json()["items"]


def test_create_defaults_status_discovered_funding_unknown(ana):
    item = make_research(ana)
    assert item["status"] == "discovered" and item["funding_status"] == "unknown"
    assert item["research_interests"] == []
    assert item["publication_links"] == [] and item["required_documents"] == []
    assert item["country"] is None and "user_id" not in item


def test_research_isolated_between_users(ana, second_client):
    item = make_research(ana)
    assert_isolated(ana, second_client, f"{RESEARCH}/{item['id']}", {"title": "Hacked"})
    assert second_client.get(RESEARCH).json()["total"] == 0


def test_filter_by_status_type_funding_country_deadline_range(ana):
    a = make_research(
        ana,
        title="A",
        status="interested",
        opportunity_type="fully_funded_phd",
        funding_status="fully_funded",
        country="Germany",
        deadline="2030-01-10",
    )
    b = make_research(
        ana,
        title="B",
        opportunity_type="fellowship",
        funding_status="self_funded",
        country="Japan",
        deadline="2030-03-10",
    )
    make_research(ana, title="C")

    def ids(**params) -> set[str]:
        r = ana.get(RESEARCH, params=params)
        assert r.status_code == 200, r.text
        return {i["id"] for i in r.json()["items"]}

    assert ids(status="interested") == {a["id"]}
    assert ids(opportunity_type="fellowship") == {b["id"]}
    assert ids(funding_status="fully_funded") == {a["id"]}
    assert ids(country="germany") == {a["id"]}
    assert ids(deadline_from="2030-02-01") == {b["id"]}
    assert ids(deadline_to="2030-01-10") == {a["id"]}
    assert ids(deadline_from="2030-01-10", deadline_to="2030-03-10") == {a["id"], b["id"]}
    assert ids(status="interested", country="Japan") == set()
    assert ana.get(RESEARCH, params={"status": "bogus"}).status_code == 422


def test_search_q_matches_title_organization_professor_area(ana):
    t = make_research(ana, title="Quantum Widgets", organization="O1")
    o = make_research(ana, title="T2", organization="Zebra Institute")
    p = make_research(ana, title="T3", organization="O3", professor_name="Dr Okafor")
    r = make_research(ana, title="T4", organization="O4", research_area="Marine Biology")
    make_research(ana, title="T5", organization="O5", notes="quantum zebra okafor marine")

    def hits(q: str) -> set[str]:
        return {i["id"] for i in ana.get(RESEARCH, params={"q": q}).json()["items"]}

    assert hits("quantum") == {t["id"]}
    assert hits("ZEBRA") == {o["id"]}
    assert hits("okafor") == {p["id"]}
    assert hits("marine") == {r["id"]}
    assert hits("50%") == set()


def test_required_documents_round_trip_and_toggle_done(ana):
    item = make_research(
        ana, required_documents=[{"name": "CV"}, {"name": "Transcript", "done": True}]
    )
    assert item["required_documents"] == [
        {"name": "CV", "done": False},
        {"name": "Transcript", "done": True},
    ]
    url = f"{RESEARCH}/{item['id']}"
    docs = [{"name": "CV", "done": True}, {"name": "Transcript", "done": True}]
    assert ana.patch(url, json={"required_documents": docs}).json()["required_documents"] == docs
    assert ana.get(url).json()["required_documents"] == docs
    ana.patch(url, json={"required_documents": [{"name": "CV", "done": False}]})
    assert ana.get(url).json()["required_documents"] == [{"name": "CV", "done": False}]


def test_required_documents_item_missing_name_returns_422(ana):
    r = ana.post(RESEARCH, json={"title": "T", "organization": "O", "required_documents": [{}]})
    assert r.status_code == 422
    detail = r.json()["error"]["details"][0]
    assert detail["loc"] == ["body", "required_documents", 0, "name"] and "message" in detail
    item = make_research(ana)
    r = ana.patch(f"{RESEARCH}/{item['id']}", json={"required_documents": [{"done": True}]})
    assert r.status_code == 422


@pytest.mark.parametrize(
    "value", ["javascript:alert(1)", "data:text/html,x", "ftp://x.com", "x.com"]
)
def test_publication_links_reject_non_http_url(ana, value):
    body = {"title": "T", "organization": "O", "publication_links": [{"title": "P", "url": value}]}
    assert ana.post(RESEARCH, json=body).status_code == 422
    item = make_research(ana)
    patch = ana.patch(
        f"{RESEARCH}/{item['id']}", json={"publication_links": body["publication_links"]}
    )
    assert patch.status_code == 422
    for field in ("website", "application_url", "professor_website"):
        assert (
            ana.post(RESEARCH, json={"title": "T", "organization": "O", field: value}).status_code
            == 422
        )
    ok = make_research(ana, publication_links=[{"title": "P", "url": "https://example.com/p"}])
    assert ok["publication_links"] == [{"title": "P", "url": "https://example.com/p"}]


def test_archiving_logs_archived_activity(ana):
    item = make_research(ana)
    ana.patch(f"{RESEARCH}/{item['id']}", json={"status": "archived"})
    actions = [a["action"] for a in activity_for(ana, item["id"])]
    assert actions == ["created", "status_changed", "archived"]
    ana.patch(f"{RESEARCH}/{item['id']}", json={"status": "archived", "notes": "x"})
    assert len(activity_for(ana, item["id"])) == 3


def test_status_change_logs_old_and_new(ana):
    item = make_research(ana)
    ana.patch(f"{RESEARCH}/{item['id']}", json={"status": "contacted_professor"})
    created, changed = activity_for(ana, item["id"])
    assert created["action"] == "created"
    assert created["metadata"]["label"] == "Vision Lab RA (ETH Zurich)"
    assert changed["action"] == "status_changed"
    assert changed["metadata"] == {
        "label": "Vision Lab RA (ETH Zurich)",
        "old": "discovered",
        "new": "contacted_professor",
    }
    assert changed["entity_type"] == "research" and changed["entity_id"] == item["id"]


def test_deadline_update_and_delete_are_logged(ana):
    item = make_research(ana, deadline="2030-01-01")
    url = f"{RESEARCH}/{item['id']}"
    ana.patch(url, json={"deadline": "2030-02-01"})
    assert ana.delete(url).status_code == 204
    assert ana.get(url).status_code == 404
    _, deadline, deleted = activity_for(ana, item["id"])
    assert deadline["action"] == "deadline_updated" and deadline["metadata"]["new"] == "2030-02-01"
    assert deleted["action"] == "deleted"


def test_patch_null_clears_optional_and_rejects_required(ana):
    item = make_research(ana, country="Germany")
    url = f"{RESEARCH}/{item['id']}"
    assert ana.patch(url, json={"country": None}).json()["country"] is None
    for field in ("title", "organization", "status", "funding_status", "required_documents"):
        assert ana.patch(url, json={field: None}).status_code == 422, field
