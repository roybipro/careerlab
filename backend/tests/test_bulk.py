import uuid

import pytest
from fastapi.testclient import TestClient

from tests.conftest import register_user

API = "/api/v1"


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


def make(c: TestClient, resource: str, n: int = 3) -> list[str]:
    bodies = {
        "jobs": lambda i: {"company_name": f"Co {i}", "position_title": "Engineer"},
        "research": lambda i: {"title": f"Lab {i}", "organization": "Uni"},
        "projects": lambda i: {"title": f"Paper {i}"},
    }
    ids = []
    for i in range(n):
        r = c.post(f"{API}/{resource}", json=bodies[resource](i))
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
    return ids


CHANGES = {
    "jobs": ({"status": "applied", "priority": "high"}, {"status": "applied", "priority": "high"}),
    "research": ({"status": "applied"}, {"status": "applied"}),
    "projects": ({"stage": "writing"}, {"stage": "writing"}),
}


@pytest.mark.parametrize("resource", ["jobs", "research", "projects"])
def test_bulk_update_changes_every_record_and_logs_each(ana, resource):
    ids = make(ana, resource)
    changes, expected = CHANGES[resource]
    r = ana.post(f"{API}/{resource}/bulk-update", json={"ids": ids[:2], "changes": changes})
    assert r.status_code == 204, r.text
    for record_id in ids[:2]:
        body = ana.get(f"{API}/{resource}/{record_id}").json()
        assert {k: body[k] for k in expected} == expected
    untouched = ana.get(f"{API}/{resource}/{ids[2]}").json()
    assert all(untouched[k] != v for k, v in expected.items())

    entity = {"jobs": "job", "research": "research", "projects": "project"}[resource]
    activity = ana.get(
        f"{API}/activity", params={"entity_type": entity, "entity_id": ids[0]}
    ).json()["items"]
    assert any(a["action"] in ("status_changed", "stage_changed") for a in activity)


@pytest.mark.parametrize("resource", ["jobs", "research", "projects"])
def test_bulk_delete_removes_every_record(ana, resource):
    ids = make(ana, resource)
    r = ana.post(f"{API}/{resource}/bulk-delete", json={"ids": ids[:2]})
    assert r.status_code == 204, r.text
    assert [ana.get(f"{API}/{resource}/{i}").status_code for i in ids] == [404, 404, 200]


@pytest.mark.parametrize("resource", ["jobs", "research", "projects"])
def test_bulk_is_all_or_nothing_when_one_id_is_unknown(ana, resource):
    ids = make(ana, resource, 2)
    changes, expected = CHANGES[resource]
    bad = [*ids, str(uuid.uuid4())]

    r = ana.post(f"{API}/{resource}/bulk-update", json={"ids": bad, "changes": changes})
    assert r.status_code == 404
    for record_id in ids:
        body = ana.get(f"{API}/{resource}/{record_id}").json()
        assert all(body[k] != v for k, v in expected.items())

    assert ana.post(f"{API}/{resource}/bulk-delete", json={"ids": bad}).status_code == 404
    assert [ana.get(f"{API}/{resource}/{i}").status_code for i in ids] == [200, 200]


@pytest.mark.parametrize("resource", ["jobs", "research", "projects"])
def test_bulk_cannot_touch_another_users_records(ana, second_client, resource):
    ids = make(ana, resource, 2)
    changes, expected = CHANGES[resource]
    r = second_client.post(f"{API}/{resource}/bulk-update", json={"ids": ids, "changes": changes})
    assert r.status_code == 404
    assert second_client.post(f"{API}/{resource}/bulk-delete", json={"ids": ids}).status_code == 404
    for record_id in ids:
        body = ana.get(f"{API}/{resource}/{record_id}").json()
        assert all(body[k] != v for k, v in expected.items())


def test_bulk_validation(ana):
    ids = make(ana, "jobs", 1)
    url = f"{API}/jobs/bulk-update"
    assert ana.post(url, json={"ids": [], "changes": {"status": "applied"}}).status_code == 422
    assert ana.post(url, json={"ids": ids, "changes": {}}).status_code == 422
    assert ana.post(url, json={"ids": ids, "changes": {"status": "nope"}}).status_code == 422
    assert ana.post(url, json={"ids": ids, "changes": {"status": None}}).status_code == 422
    too_many = [str(uuid.uuid4()) for _ in range(101)]
    assert ana.post(f"{API}/jobs/bulk-delete", json={"ids": too_many}).status_code == 422


def test_bulk_repeated_id_is_changed_once(ana):
    ids = make(ana, "jobs", 1)
    r = ana.post(f"{API}/jobs/bulk-update", json={"ids": ids * 3, "changes": {"status": "applied"}})
    assert r.status_code == 204
    activity = ana.get(
        f"{API}/activity", params={"entity_type": "job", "entity_id": ids[0]}
    ).json()["items"]
    assert sum(a["action"] == "status_changed" for a in activity) == 1
    assert ana.post(f"{API}/jobs/bulk-delete", json={"ids": ids * 2}).status_code == 204


def test_bulk_needs_csrf_header(ana):
    ids = make(ana, "jobs", 1)
    r = ana.post(f"{API}/jobs/bulk-delete", json={"ids": ids}, headers={"X-Requested-With": "x"})
    assert r.status_code == 403
    assert ana.get(f"{API}/jobs/{ids[0]}").status_code == 200
