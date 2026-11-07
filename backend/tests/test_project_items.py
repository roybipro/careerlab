from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.projects.models import ProjectMilestone
from tests.conftest import register_user

PROJECTS = "/api/v1/projects"
ACTIVITY = "/api/v1/activity"


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


def make_project(c: TestClient, **fields) -> dict:
    r = c.post(PROJECTS, json={"title": "Sparse Attention Study", **fields})
    assert r.status_code == 201, r.text
    return r.json()


def subs(project_id: str) -> str:
    return f"{PROJECTS}/{project_id}/submissions"


def miles(project_id: str) -> str:
    return f"{PROJECTS}/{project_id}/milestones"


def make_sub(c: TestClient, project_id: str, **fields) -> dict:
    r = c.post(subs(project_id), json={"venue_name": "Northfield Symposium", **fields})
    assert r.status_code == 201, r.text
    return r.json()


def make_mile(c: TestClient, project_id: str, **fields) -> dict:
    r = c.post(miles(project_id), json={"title": "Draft methods", **fields})
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


def test_submission_crud_defaults_conference_planned(ana):
    p = make_project(ana)
    s = make_sub(ana, p["id"])
    assert s["venue_type"] == "conference" and s["status"] == "planned"
    assert s["venue_url"] is None and s["paper_deadline"] is None
    assert s["project_id"] == p["id"] and "user_id" not in s

    url = f"{subs(p['id'])}/{s['id']}"
    r = ana.patch(
        url,
        json={
            "venue_type": "journal",
            "venue_url": "https://journal.example.org/cfp",
            "paper_deadline": "2031-03-01",
            "feedback": "Needs ablations",
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["venue_type"] == "journal" and r.json()["paper_deadline"] == "2031-03-01"
    assert r.json()["venue_name"] == "Northfield Symposium"

    page = ana.get(subs(p["id"])).json()
    assert page["total"] == 1 and page["page"] == 1 and page["page_size"] == 20
    assert page["items"][0]["feedback"] == "Needs ablations"

    assert ana.patch(url, json={"venue_name": None}).status_code == 422
    assert ana.patch(url, json={"status": None}).status_code == 422
    assert ana.post(subs(p["id"]), json={}).status_code == 422
    assert ana.post(subs(p["id"]), json={"venue_name": "X", "status": "bogus"}).status_code == 422
    assert ana.delete(url).status_code == 204
    assert ana.get(subs(p["id"])).json()["total"] == 0
    assert ana.delete(url).status_code == 404


def test_submission_venue_url_rejects_non_http(ana):
    p = make_project(ana)
    for bad in ("javascript:alert(1)", "ftp://files.example.org/x", "not a url"):
        r = ana.post(subs(p["id"]), json={"venue_name": "V", "venue_url": bad})
        assert r.status_code == 422, bad
        assert r.json()["error"]["code"] == "validation_error"
    s = make_sub(ana, p["id"], venue_url="http://venue.example.org")
    url = f"{subs(p['id'])}/{s['id']}"
    assert ana.patch(url, json={"venue_url": "data:text/html,x"}).status_code == 422
    r = ana.patch(url, json={"venue_url": None})
    assert r.status_code == 200 and r.json()["venue_url"] is None


def test_abstract_after_paper_returns_422_on_create(ana):
    p = make_project(ana)
    r = ana.post(
        subs(p["id"]),
        json={"venue_name": "V", "abstract_deadline": "2031-02-02", "paper_deadline": "2031-02-01"},
    )
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "validation_error"
    assert ana.get(subs(p["id"])).json()["total"] == 0
    ok = ana.post(
        subs(p["id"]),
        json={"venue_name": "V", "abstract_deadline": "2031-02-01", "paper_deadline": "2031-02-01"},
    )
    assert ok.status_code == 201


def test_patch_only_abstract_after_stored_paper_returns_422(ana):
    p = make_project(ana)
    s = make_sub(ana, p["id"], paper_deadline="2031-02-01")
    url = f"{subs(p['id'])}/{s['id']}"
    r = ana.patch(url, json={"abstract_deadline": "2031-02-05"})
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "validation_error"
    # and the mirror case: only the paper deadline moves before the stored abstract
    s2 = make_sub(ana, p["id"], abstract_deadline="2031-02-10")
    r = ana.patch(f"{subs(p['id'])}/{s2['id']}", json={"paper_deadline": "2031-02-01"})
    assert r.status_code == 422, r.text
    assert ana.get(subs(p["id"])).json()["total"] == 2
    unchanged = [i for i in ana.get(subs(p["id"])).json()["items"] if i["id"] == s["id"]][0]
    assert unchanged["abstract_deadline"] is None


def test_patch_clearing_a_deadline_succeeds(ana):
    p = make_project(ana)
    s = make_sub(ana, p["id"], abstract_deadline="2031-01-01", paper_deadline="2031-02-01")
    url = f"{subs(p['id'])}/{s['id']}"
    r = ana.patch(url, json={"paper_deadline": None})
    assert r.status_code == 200, r.text
    assert r.json()["paper_deadline"] is None and r.json()["abstract_deadline"] == "2031-01-01"
    # with the paper deadline gone, a later abstract deadline is fine
    assert ana.patch(url, json={"abstract_deadline": "2031-06-01"}).status_code == 200


def test_several_submissions_on_one_project(ana):
    p = make_project(ana)
    a = make_sub(ana, p["id"], venue_name="Harbor Workshop")
    b = make_sub(ana, p["id"], venue_name="Lakeside Journal", venue_type="journal")
    c = make_sub(ana, p["id"], venue_name="Ridge Conference")
    page = ana.get(subs(p["id"])).json()
    assert page["total"] == 3
    assert {i["id"] for i in page["items"]} == {a["id"], b["id"], c["id"]}
    assert ana.get(f"{PROJECTS}/{p['id']}").json()["submissions_total"] == 3
    r = ana.get(subs(p["id"]), params={"q": "journal"}).json()
    assert [i["id"] for i in r["items"]] == [b["id"]]
    r = ana.get(subs(p["id"]), params={"page_size": 2, "page": 2}).json()
    assert r["total"] == 3 and len(r["items"]) == 1 and r["page_size"] == 2
    assert ana.get(subs(p["id"]), params={"page_size": 101}).status_code == 422
    assert ana.get(subs(p["id"]), params={"sort": "bogus"}).status_code == 422
    r = ana.get(subs(p["id"]), params={"sort": "venue_name"}).json()
    assert [i["venue_name"] for i in r["items"]] == [
        "Harbor Workshop",
        "Lakeside Journal",
        "Ridge Conference",
    ]


def test_submission_status_change_logs_venue_old_new(ana):
    p = make_project(ana)
    s = make_sub(ana, p["id"], venue_name="Harbor Workshop")
    url = f"{subs(p['id'])}/{s['id']}"
    assert (
        ana.patch(url, json={"status": "submitted", "submitted_on": "2031-02-01"}).status_code
        == 200
    )
    events = activity_for(ana, p["id"])
    assert [e["action"] for e in events] == [
        "created",
        "submission_added",
        "submission_status_changed",
    ]
    assert events[2]["metadata"] == {
        "label": "Sparse Attention Study",
        "venue": "Harbor Workshop",
        "old": "planned",
        "new": "submitted",
    }
    # the same status, or another field, logs nothing
    assert ana.patch(url, json={"status": "submitted"}).status_code == 200
    assert ana.patch(url, json={"feedback": "ok"}).status_code == 200
    assert len(activity_for(ana, p["id"])) == 3


def test_submission_added_logged_on_project(ana):
    p = make_project(ana, title="Graph Models")
    make_sub(ana, p["id"], venue_name="Harbor Workshop")
    events = activity_for(ana, p["id"])
    assert [e["action"] for e in events] == ["created", "submission_added"]
    assert events[1]["metadata"] == {"label": "Graph Models", "venue": "Harbor Workshop"}


def test_milestone_crud_and_order_undated_last(ana):
    p = make_project(ana)
    undated = make_mile(ana, p["id"], title="Undated first created")
    late = make_mile(ana, p["id"], title="Late", due_date="2031-05-01")
    early = make_mile(ana, p["id"], title="Early", due_date="2031-01-01")
    early_two = make_mile(ana, p["id"], title="Early two", due_date="2031-01-01")
    undated_two = make_mile(ana, p["id"], title="Undated second")
    assert undated["is_done"] is False and undated["completed_at"] is None
    assert "user_id" not in undated and undated["project_id"] == p["id"]

    page = ana.get(miles(p["id"])).json()
    assert [i["id"] for i in page["items"]] == [
        early["id"],
        early_two["id"],
        late["id"],
        undated["id"],
        undated_two["id"],
    ]
    assert page["total"] == 5

    url = f"{miles(p['id'])}/{late['id']}"
    r = ana.patch(url, json={"title": "Renamed", "due_date": None})
    assert r.status_code == 200 and r.json()["title"] == "Renamed" and r.json()["due_date"] is None
    ids = [i["id"] for i in ana.get(miles(p["id"])).json()["items"]]
    assert ids[-3:] == [undated["id"], late["id"], undated_two["id"]]

    assert ana.patch(url, json={"title": None}).status_code == 422
    assert ana.patch(url, json={"is_done": None}).status_code == 422
    assert ana.post(miles(p["id"]), json={"title": "  "}).status_code == 422
    assert ana.delete(url).status_code == 204
    assert ana.get(miles(p["id"])).json()["total"] == 4
    assert ana.delete(url).status_code == 404
    r = ana.get(miles(p["id"]), params={"q": "early two"}).json()
    assert [i["id"] for i in r["items"]] == [early_two["id"]]


def test_ticking_twice_keeps_completed_at_and_logs_once(ana, db: Session):
    p = make_project(ana, title="Graph Models")
    m = make_mile(ana, p["id"], title="Run baselines")
    url = f"{miles(p['id'])}/{m['id']}"
    first = ana.patch(url, json={"is_done": True})
    assert first.status_code == 200, first.text
    assert first.json()["is_done"] is True and first.json()["completed_at"] is not None
    second = ana.patch(url, json={"is_done": True})
    assert second.json()["completed_at"] == first.json()["completed_at"]
    stored = db.scalar(select(ProjectMilestone.completed_at))
    assert stored is not None
    events = activity_for(ana, p["id"])
    assert [e["action"] for e in events] == ["created", "milestone_completed"]
    assert events[1]["metadata"] == {"label": "Graph Models", "milestone": "Run baselines"}


def test_reopen_clears_completed_at_then_ticking_logs_again(ana):
    p = make_project(ana)
    m = make_mile(ana, p["id"])
    url = f"{miles(p['id'])}/{m['id']}"
    assert ana.patch(url, json={"is_done": True}).status_code == 200
    r = ana.patch(url, json={"is_done": False})
    assert r.json()["is_done"] is False and r.json()["completed_at"] is None
    assert ana.patch(url, json={"is_done": True}).json()["completed_at"] is not None
    actions = [e["action"] for e in activity_for(ana, p["id"])]
    assert actions == ["created", "milestone_completed", "milestone_completed"]
    # created already done: completed_at is set and the completion is logged
    done = make_mile(ana, p["id"], title="Already done", is_done=True)
    assert done["completed_at"] is not None
    assert [e["action"] for e in activity_for(ana, p["id"])][-1] == "milestone_completed"


@pytest.mark.parametrize("kind", ["submissions", "milestones"])
def test_item_under_wrong_project_returns_404_and_changes_nothing(ana, kind):
    a = make_project(ana, title="A")
    b = make_project(ana, title="B")
    if kind == "submissions":
        item = make_sub(ana, a["id"], paper_deadline="2031-02-01")
        patch = {"venue_name": "Hacked"}
    else:
        item = make_mile(ana, a["id"], due_date="2031-02-01")
        patch = {"title": "Hacked"}
    base = f"{PROJECTS}/{b['id']}/{kind}/{item['id']}"
    before = ana.get(f"{PROJECTS}/{a['id']}/{kind}").json()
    events_before = activity_for(ana, a["id"]) + activity_for(ana, b["id"])

    assert ana.patch(base, json=patch).status_code == 404
    assert ana.delete(base).status_code == 404

    assert ana.get(f"{PROJECTS}/{a['id']}/{kind}").json() == before
    assert ana.get(f"{PROJECTS}/{b['id']}/{kind}").json()["total"] == 0
    assert activity_for(ana, a["id"]) + activity_for(ana, b["id"]) == events_before
    assert ana.get(f"{PROJECTS}/{a['id']}").json()["updated_at"] == a["updated_at"]


def test_items_isolated_between_users(ana, second_client):
    p = make_project(ana)
    s = make_sub(ana, p["id"], paper_deadline="2031-02-01")
    m = make_mile(ana, p["id"], due_date="2031-02-01")
    sub_url = f"{subs(p['id'])}/{s['id']}"
    mile_url = f"{miles(p['id'])}/{m['id']}"
    before = (ana.get(subs(p["id"])).json(), ana.get(miles(p["id"])).json())
    events_before = activity_for(ana, p["id"])

    other = second_client
    assert other.get(subs(p["id"])).status_code == 404
    assert other.get(miles(p["id"])).status_code == 404
    assert other.post(subs(p["id"]), json={"venue_name": "Intruder"}).status_code == 404
    assert other.post(miles(p["id"]), json={"title": "Intruder"}).status_code == 404
    assert other.patch(sub_url, json={"venue_name": "Hacked"}).status_code == 404
    assert other.patch(mile_url, json={"title": "Hacked"}).status_code == 404
    assert other.delete(sub_url).status_code == 404
    assert other.delete(mile_url).status_code == 404

    assert (ana.get(subs(p["id"])).json(), ana.get(miles(p["id"])).json()) == before
    assert activity_for(ana, p["id"]) == events_before


def test_abstract_submitted_on_is_isolated_between_users(ana, second_client):
    p = make_project(ana)
    s = make_sub(ana, p["id"], abstract_deadline="2031-01-01", paper_deadline="2031-02-01")
    assert s["abstract_submitted_on"] is None
    url = f"{subs(p['id'])}/{s['id']}"
    r = second_client.patch(url, json={"abstract_submitted_on": "2030-12-30"})
    assert r.status_code == 404
    assert ana.get(subs(p["id"])).json()["items"][0]["abstract_submitted_on"] is None
    # The owner can set and clear it; a null clears.
    assert (
        ana.patch(url, json={"abstract_submitted_on": "2030-12-30"}).json()["abstract_submitted_on"]
        == "2030-12-30"
    )
    assert (
        ana.patch(url, json={"abstract_submitted_on": None}).json()["abstract_submitted_on"] is None
    )


def test_counts_and_next_deadline_follow_changes(ana):
    p = make_project(ana)
    pid = p["id"]
    today_s = today()
    soon = (today_s + timedelta(days=3)).isoformat()
    later = (today_s + timedelta(days=30)).isoformat()
    params = {"today": today_s.isoformat()}

    def project() -> dict:
        r = ana.get(f"{PROJECTS}/{pid}", params=params)
        assert r.status_code == 200, r.text
        return r.json()

    s = make_sub(ana, pid, paper_deadline=later)
    p1 = project()
    assert p1["submissions_total"] == 1 and p1["next_deadline"] == later
    m = make_mile(ana, pid, due_date=soon)
    p2 = project()
    assert p2["milestones_total"] == 1 and p2["milestones_done"] == 0
    assert p2["next_deadline"] == soon

    mile_url = f"{miles(pid)}/{m['id']}"
    assert ana.patch(mile_url, json={"is_done": True}).status_code == 200
    p3 = project()
    assert p3["milestones_done"] == 1 and p3["next_deadline"] == later

    assert ana.patch(mile_url, json={"is_done": False}).status_code == 200
    assert project()["next_deadline"] == soon
    assert ana.patch(mile_url, json={"due_date": None}).status_code == 200
    assert project()["next_deadline"] == later

    sub_url = f"{subs(pid)}/{s['id']}"
    assert ana.patch(sub_url, json={"status": "submitted"}).status_code == 200
    assert project()["next_deadline"] is None
    # back to planned: the deadlines count again
    assert ana.patch(sub_url, json={"status": "planned"}).status_code == 200
    assert project()["next_deadline"] == later

    assert ana.delete(sub_url).status_code == 204
    after_sub = project()
    assert after_sub["submissions_total"] == 0 and after_sub["next_deadline"] is None
    assert ana.delete(mile_url).status_code == 204
    assert project()["milestones_total"] == 0
