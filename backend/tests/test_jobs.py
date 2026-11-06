import uuid

import pytest
from fastapi.testclient import TestClient

from tests.conftest import register_user
from tests.isolation import assert_isolated

JOBS = "/api/v1/jobs"
ACTIVITY = "/api/v1/activity"


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


def make_job(c: TestClient, **fields) -> dict:
    body = {"company_name": "Acme", "position_title": "Engineer", **fields}
    r = c.post(JOBS, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def activity_for(c: TestClient, job_id: str) -> list[dict]:
    r = c.get(ACTIVITY, params={"entity_type": "job", "entity_id": job_id, "sort": "created_at"})
    assert r.status_code == 200, r.text
    return r.json()["items"]


def test_create_job_defaults_status_wishlist_priority_medium(ana):
    job = make_job(ana)
    assert job["status"] == "wishlist" and job["priority"] == "medium"
    assert job["company_name"] == "Acme" and job["salary_min"] is None
    uuid.UUID(job["id"])
    assert "user_id" not in job


def test_required_fields_missing_returns_422(ana):
    r = ana.post(JOBS, json={"company_name": "Acme"})
    assert r.status_code == 422
    assert r.json()["error"]["details"][0]["loc"] == ["body", "position_title"]
    assert ana.post(JOBS, json={"position_title": "x", "company_name": "  "}).status_code == 422


@pytest.mark.parametrize("field", ["company_website", "company_logo_url", "job_url"])
@pytest.mark.parametrize(
    "value", ["javascript:alert(1)", "data:text/html,x", "ftp://x.com", "x.com"]
)
def test_non_http_urls_are_rejected(ana, field, value):
    assert (
        ana.post(JOBS, json={"company_name": "A", "position_title": "B", field: value}).status_code
        == 422
    )
    job = make_job(ana)
    assert ana.patch(f"{JOBS}/{job['id']}", json={field: value}).status_code == 422


def test_http_urls_are_accepted(ana):
    job = make_job(ana, job_url="https://example.com/jobs/1", company_website="http://example.com")
    assert job["job_url"] == "https://example.com/jobs/1"


def test_missing_csrf_header_returns_403(ana, raw_client):
    raw_client.cookies = ana.cookies
    assert (
        raw_client.post(JOBS, json={"company_name": "A", "position_title": "B"}).status_code == 403
    )


def test_unauthenticated_returns_401(client):
    assert client.get(JOBS).status_code == 401
    assert client.get(ACTIVITY).status_code == 401


def test_get_update_delete_job(ana):
    job = make_job(ana)
    url = f"{JOBS}/{job['id']}"
    assert ana.get(url).json() == job

    r = ana.patch(url, json={"company_name": "Globex", "priority": "high"})
    assert r.status_code == 200
    assert r.json()["company_name"] == "Globex" and r.json()["priority"] == "high"
    assert ana.get(url).json()["company_name"] == "Globex"

    assert ana.delete(url).status_code == 204
    assert ana.get(url).status_code == 404
    assert ana.delete(url).status_code == 404


def test_non_uuid_id_returns_422(ana):
    assert ana.get(f"{JOBS}/not-a-uuid").status_code == 422
    assert ana.patch(f"{JOBS}/123", json={}).status_code == 422
    assert ana.delete(f"{JOBS}/abc").status_code == 422


def test_unknown_id_returns_404(ana):
    assert ana.get(f"{JOBS}/{uuid.uuid4()}").status_code == 404


def test_jobs_are_isolated_between_users(ana, second_client):
    job = make_job(ana)
    assert_isolated(ana, second_client, f"{JOBS}/{job['id']}", {"company_name": "Hacked"})


def test_list_paginates_and_reports_total(ana):
    for i in range(7):
        make_job(ana, company_name=f"Co{i}")
    first = ana.get(JOBS, params={"page_size": 3, "sort": "company_name"}).json()
    assert first["total"] == 7 and first["page"] == 1 and first["page_size"] == 3
    assert [j["company_name"] for j in first["items"]] == ["Co0", "Co1", "Co2"]
    last = ana.get(JOBS, params={"page": 3, "page_size": 3, "sort": "company_name"}).json()
    assert [j["company_name"] for j in last["items"]] == ["Co6"]
    assert ana.get(JOBS, params={"page": 9, "page_size": 3}).json()["items"] == []


def test_list_only_returns_own_jobs(ana, second_client):
    make_job(ana)
    assert second_client.get(JOBS).json()["total"] == 0


def test_pages_do_not_repeat_or_skip_rows_with_equal_sort_values(ana):
    ids = {make_job(ana, company_name=f"Co{i}", deadline="2030-01-01")["id"] for i in range(7)}
    seen: list[str] = []
    for page in (1, 2, 3):
        r = ana.get(JOBS, params={"page": page, "page_size": 3, "sort": "deadline"})
        seen += [j["id"] for j in r.json()["items"]]
    assert len(seen) == 7 and set(seen) == ids


def test_huge_page_returns_422(ana):
    r = ana.get(JOBS, params={"page": 10**30})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    assert ana.get(JOBS, params={"page": 9_223_372_036_854_775_807}).status_code == 422


def test_page_size_over_100_returns_422(ana):
    assert ana.get(JOBS, params={"page_size": 101}).status_code == 422
    assert ana.get(JOBS, params={"page_size": 100}).status_code == 200


def test_sort_by_deadline_desc_and_unknown_sort_returns_422(ana):
    make_job(ana, company_name="early", deadline="2030-01-01")
    make_job(ana, company_name="late", deadline="2030-06-01")
    make_job(ana, company_name="none")
    desc = ana.get(JOBS, params={"sort": "-deadline"}).json()["items"]
    assert [j["company_name"] for j in desc] == ["late", "early", "none"]
    asc = ana.get(JOBS, params={"sort": "deadline"}).json()["items"]
    assert [j["company_name"] for j in asc] == ["early", "late", "none"]
    r = ana.get(JOBS, params={"sort": "password"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"


def names(c: TestClient, **params) -> list[str]:
    r = c.get(JOBS, params={"sort": "company_name", **params})
    assert r.status_code == 200, r.text
    return [j["company_name"] for j in r.json()["items"]]


def test_filter_by_each_of_company_position_status_priority_job_type_and_date_ranges(ana):
    make_job(
        ana,
        company_name="Alpha Labs",
        position_title="Backend Dev",
        status="applied",
        priority="high",
        job_type="remote",
        application_date="2030-01-10",
        deadline="2030-02-10",
    )
    make_job(
        ana,
        company_name="Beta Inc",
        position_title="Designer",
        status="offer",
        priority="low",
        job_type="hybrid",
        application_date="2030-03-10",
        deadline="2030-04-10",
    )
    make_job(ana, company_name="Gamma")

    assert names(ana, company="alpha") == ["Alpha Labs"]
    assert names(ana, position="design") == ["Beta Inc"]
    assert names(ana, status="offer") == ["Beta Inc"]
    assert names(ana, status="wishlist") == ["Gamma"]
    assert names(ana, priority="high") == ["Alpha Labs"]
    assert names(ana, job_type="hybrid") == ["Beta Inc"]
    assert names(ana, application_date_from="2030-02-01") == ["Beta Inc"]
    assert names(ana, application_date_to="2030-02-01") == ["Alpha Labs"]
    assert names(ana, application_date_from="2030-01-10", application_date_to="2030-03-10") == [
        "Alpha Labs",
        "Beta Inc",
    ]
    assert names(ana, deadline_from="2030-03-01") == ["Beta Inc"]
    assert names(ana, deadline_to="2030-03-01") == ["Alpha Labs"]
    assert names(ana, status="applied", priority="low") == []
    assert ana.get(JOBS, params={"status": "nonsense"}).status_code == 422


def test_search_q_treats_percent_and_underscore_literally(ana):
    for name in ("50% Corp", "500 Corp", "a_b", "axb"):
        make_job(ana, company_name=name)
    assert names(ana, q="50%") == ["50% Corp"]
    assert names(ana, q="a_b") == ["a_b"]
    assert names(ana, company="50%") == ["50% Corp"]
    assert sorted(names(ana, q="CORP")) == ["50% Corp", "500 Corp"]


def test_patch_salary_min_above_stored_max_returns_422(ana):
    job = make_job(ana, salary_min=1000, salary_max=2000)
    url = f"{JOBS}/{job['id']}"
    r = ana.patch(url, json={"salary_min": 3000})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    assert ana.patch(url, json={"salary_max": 500}).status_code == 422
    assert ana.patch(url, json={"salary_min": 3000, "salary_max": 2500}).status_code == 422
    assert ana.get(url).json()["salary_min"] == 1000
    assert ana.patch(url, json={"salary_min": 2000}).status_code == 200
    assert (
        ana.post(
            JOBS,
            json={"company_name": "A", "position_title": "B", "salary_min": 5, "salary_max": 1},
        ).status_code
        == 422
    )


def test_patch_null_clears_optional_field(ana):
    job = make_job(ana, location="Lisbon", deadline="2030-01-01", salary_min=10)
    r = ana.patch(f"{JOBS}/{job['id']}", json={"location": None, "deadline": None})
    assert r.status_code == 200
    body = r.json()
    assert body["location"] is None and body["deadline"] is None and body["salary_min"] == 10


def test_patch_null_on_required_field_returns_422(ana):
    job = make_job(ana)
    for field in ("company_name", "position_title", "status", "priority"):
        assert ana.patch(f"{JOBS}/{job['id']}", json={field: None}).status_code == 422


def test_patch_omitted_field_is_unchanged(ana):
    job = make_job(ana, location="Lisbon", notes="n", status="applied")
    r = ana.patch(f"{JOBS}/{job['id']}", json={"notes": "changed"})
    body = r.json()
    assert (
        body["notes"] == "changed" and body["location"] == "Lisbon" and body["status"] == "applied"
    )


def test_interview_at_without_utc_offset_returns_422(ana):
    r = ana.post(
        JOBS,
        json={"company_name": "A", "position_title": "B", "interview_at": "2030-01-01T10:00:00"},
    )
    assert r.status_code == 422


def test_activity_created_status_changed_with_old_and_new(ana):
    job = make_job(ana)
    ana.patch(f"{JOBS}/{job['id']}", json={"status": "applied"})
    created, changed = activity_for(ana, job["id"])
    assert created["action"] == "created" and created["metadata"]["label"] == "Engineer at Acme"
    assert changed["action"] == "status_changed"
    assert changed["metadata"] == {"label": "Engineer at Acme", "old": "wishlist", "new": "applied"}
    assert changed["entity_type"] == "job" and changed["entity_id"] == job["id"]


def test_activity_deadline_updated_and_interview_scheduled(ana):
    job = make_job(ana, deadline="2030-01-01")
    url = f"{JOBS}/{job['id']}"
    ana.patch(url, json={"deadline": "2030-02-01"})
    ana.patch(url, json={"interview_at": "2030-03-01T10:00:00+00:00"})
    _, deadline, interview = activity_for(ana, job["id"])
    assert deadline["action"] == "deadline_updated"
    assert (
        deadline["metadata"]["old"] == "2030-01-01" and deadline["metadata"]["new"] == "2030-02-01"
    )
    assert interview["action"] == "interview_scheduled"
    assert interview["metadata"]["interview_at"].startswith("2030-03-01T10:00:00")


def test_one_patch_logs_each_change_once(ana):
    job = make_job(ana)
    ana.patch(
        f"{JOBS}/{job['id']}", json={"status": "interview", "deadline": "2030-02-01", "notes": "x"}
    )
    assert [a["action"] for a in activity_for(ana, job["id"])][1:] == [
        "status_changed",
        "deadline_updated",
    ]


def test_no_activity_when_patch_changes_nothing(ana):
    job = make_job(ana, status="applied", deadline="2030-01-01")
    url = f"{JOBS}/{job['id']}"
    ana.patch(url, json={"status": "applied", "deadline": "2030-01-01"})
    ana.patch(url, json={})
    assert [a["action"] for a in activity_for(ana, job["id"])] == ["created"]
    assert ana.get(url).json()["updated_at"] == job["updated_at"]


def test_delete_keeps_activity_with_deleted_entry(ana):
    job = make_job(ana)
    ana.delete(f"{JOBS}/{job['id']}")
    actions = [a["action"] for a in activity_for(ana, job["id"])]
    assert actions == ["created", "deleted"]


def test_activity_list_excludes_other_users(ana, second_client):
    job = make_job(ana)
    assert second_client.get(ACTIVITY).json() == {
        "items": [],
        "total": 0,
        "page": 1,
        "page_size": 20,
    }
    assert second_client.get(ACTIVITY, params={"entity_id": job["id"]}).json()["total"] == 0
    assert ana.get(ACTIVITY).json()["total"] == 1


def test_activity_filters_by_entity(ana):
    first, second = make_job(ana), make_job(ana, company_name="Other")
    assert ana.get(ACTIVITY).json()["total"] == 2
    assert ana.get(ACTIVITY, params={"entity_id": second["id"]}).json()["total"] == 1
    assert (
        ana.get(ACTIVITY, params={"entity_type": "job", "entity_id": first["id"]}).json()["total"]
        == 1
    )
    assert ana.get(ACTIVITY, params={"entity_type": "contact"}).json()["total"] == 0
    assert ana.get(ACTIVITY, params={"entity_type": "bogus"}).status_code == 422
