from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.modules.calendar.service import Event, _fold, render_ics
from tests.conftest import register_user

API = "/api/v1"
FEED = f"{API}/calendar/feed"


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


def day(offset: int) -> str:
    return (date.today() + timedelta(days=offset)).isoformat()


def at(**delta) -> str:
    return (datetime.now(UTC) + timedelta(**delta)).isoformat()


def turn_on(c: TestClient) -> str:
    r = c.post(FEED)
    assert r.status_code == 200, r.text
    path = r.json()["path"]
    assert path.startswith("/api/v1/calendar/") and path.endswith(".ics")
    return path


def fetch(c: TestClient, path: str) -> str:
    # Calendar apps send no cookie and no CSRF header.
    c.cookies.clear()
    r = c.get(path, headers={"X-Requested-With": ""})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/calendar")
    return r.text


def test_feed_off_by_default_then_on_then_off(ana):
    assert ana.get(FEED).json() == {"enabled": False}
    path = turn_on(ana)
    assert ana.get(FEED).json() == {"enabled": True}
    assert ana.delete(FEED).status_code == 204
    assert ana.get(FEED).json() == {"enabled": False}
    ana.cookies.clear()
    assert ana.get(path).status_code == 404


def test_reset_makes_a_new_link_and_kills_the_old_one(ana, app):
    old = turn_on(ana)
    new = turn_on(ana)
    assert old != new
    with TestClient(app) as anon:
        assert anon.get(old).status_code == 404
        assert anon.get(new).status_code == 200


def test_only_a_hash_of_the_secret_is_stored(ana, db):
    from sqlalchemy import select

    from app.modules.auth.models import User

    path = turn_on(ana)
    token = path.removeprefix("/api/v1/calendar/").removesuffix(".ics")
    stored = db.scalar(select(User.calendar_token_hash))
    assert stored and token not in stored and len(stored) == 64


def test_unknown_link_is_404(client):
    assert client.get(f"{API}/calendar/not-a-real-token.ics").status_code == 404


def test_feed_settings_need_login(client):
    assert client.get(FEED).status_code == 401
    assert client.post(FEED).status_code == 401


def test_feed_lists_open_work_and_skips_closed_work(ana, app):
    ana.post(
        f"{API}/jobs",
        json={
            "company_name": "Acme",
            "position_title": "Engineer",
            "deadline": day(5),
            "follow_up_date": day(7),
            "interview_at": at(days=3),
            "location": "Remote, EU",
        },
    )
    ana.post(
        f"{API}/jobs",
        json={
            "company_name": "Gone",
            "position_title": "X",
            "status": "rejected",
            "deadline": day(5),
        },
    )
    ana.post(
        f"{API}/research", json={"title": "Vision RA", "organization": "ETH", "deadline": day(9)}
    )
    project = ana.post(f"{API}/projects", json={"title": "My paper", "target_date": day(30)}).json()
    ana.post(
        f"{API}/projects/{project['id']}/submissions",
        json={
            "venue_name": "NeurIPS",
            "abstract_deadline": day(10),
            "paper_deadline": day(14),
        },
    )
    ana.post(
        f"{API}/projects/{project['id']}/milestones", json={"title": "Draft", "due_date": day(4)}
    )
    ana.post(f"{API}/reminders", json={"title": "Email prof", "due_at": at(days=1)})
    done = ana.post(f"{API}/reminders", json={"title": "Old one", "due_at": at(days=2)}).json()
    ana.patch(f"{API}/reminders/{done['id']}", json={"is_completed": True})
    ana.post(
        f"{API}/jobs",
        json={
            "company_name": "Ancient",
            "position_title": "X",
            "deadline": day(-200),
        },
    )

    path = turn_on(ana)
    with TestClient(app) as anon:
        ics = fetch(anon, path)

    unfolded = ics.replace("\r\n ", "")
    for summary in [
        "Deadline: Acme: Engineer",
        "Follow up: Acme: Engineer",
        "Interview: Acme: Engineer",
        "Deadline: Vision RA (ETH)",
        "Target: My paper",
        "Abstract due: NeurIPS (My paper)",
        "Paper due: NeurIPS (My paper)",
        "Milestone: Draft (My paper)",
        "Reminder: Email prof",
    ]:
        assert f"SUMMARY:{summary}" in unfolded, summary
    assert "Gone" not in unfolded and "Old one" not in unfolded and "Ancient" not in unfolded
    # Commas are escaped in text values.
    assert "DESCRIPTION:Remote\\, EU" in unfolded
    assert unfolded.startswith("BEGIN:VCALENDAR\r\n") and unfolded.endswith("END:VCALENDAR\r\n")
    assert unfolded.count("BEGIN:VEVENT") == 9


def test_feed_only_has_the_owners_records(ana, second_client, app):
    ana.post(
        f"{API}/jobs", json={"company_name": "Mine", "position_title": "X", "deadline": day(3)}
    )
    second_client.post(
        f"{API}/jobs", json={"company_name": "Theirs", "position_title": "X", "deadline": day(3)}
    )
    path = turn_on(ana)
    with TestClient(app) as anon:
        ics = fetch(anon, path)
    assert "Mine" in ics and "Theirs" not in ics


def test_render_all_day_and_timed_events():
    now = datetime(2026, 11, 28, 9, 0, tzinfo=UTC)
    ics = render_ics(
        [
            Event("a", "All day", date(2026, 12, 1)),
            Event("b", "Timed", datetime(2026, 12, 2, 15, 30, tzinfo=UTC), timedelta(hours=1)),
        ],
        now,
    )
    assert "DTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261202" in ics
    assert "DTSTART:20261202T153000Z\r\nDTEND:20261202T163000Z" in ics
    assert "UID:a@careerlab" in ics and "DTSTAMP:20261128T090000Z" in ics


def test_long_lines_fold_at_75_octets_without_splitting_characters():
    line = "SUMMARY:" + "é" * 100
    folded = _fold(line)
    parts = folded.split("\r\n")
    assert all(len(p.encode()) <= 75 for p in parts)
    assert all(p.startswith(" ") for p in parts[1:])
    assert "".join([parts[0], *(p[1:] for p in parts[1:])]) == line
