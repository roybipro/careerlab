"""Dashboard tests use a fixed `now` passed to the service.

Without `today`, "today" is the UTC date of `now`.
"""

import uuid
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.activity.models import ActivityLog
from app.modules.auth.models import User
from app.modules.contacts.models import Contact
from app.modules.dashboard import service
from app.modules.jobs.models import JobApplication, JobStatus
from app.modules.reminders.models import Reminder
from app.modules.research.models import ResearchOpportunity, ResearchStatus
from tests.conftest import register_user

DASHBOARD = "/api/v1/dashboard"
NOW = datetime(2026, 11, 6, 12, 0, tzinfo=UTC)
TODAY = NOW.date()

STAT_KEYS = [
    "total_jobs",
    "total_research",
    "in_progress",
    "interviews_scheduled",
    "offers",
    "rejected",
    "upcoming_deadlines",
    "pending_follow_ups",
]
# Research project numbers are tested in test_projects_dashboard.py.
SUMMARY_KEYS = [*STAT_KEYS, "active_research_projects"]


def days(n: int) -> date:
    return TODAY + timedelta(days=n)


def make_user(db: Session, email: str = "ana@x.com") -> User:
    user = User(full_name="Ana Lima", email=email, password_hash="x")
    db.add(user)
    db.commit()
    return user


def add(db: Session, user: User, kind: str, **fields: Any) -> Any:
    """Insert one record owned by `user`. `kind` is job, research, reminder, contact."""
    n = uuid.uuid4().hex[:6]
    match kind:
        case "job":
            row: Any = JobApplication(
                user_id=user.id,
                company_name=f"Co {n}",
                position_title="Engineer",
                **fields,
            )
        case "research":
            row = ResearchOpportunity(
                user_id=user.id, title=f"Study {n}", organization=f"Uni {n}", **fields
            )
        case "reminder":
            row = Reminder(user_id=user.id, title=f"Remind {n}", **fields)
        case "contact":
            row = Contact(user_id=user.id, name=f"Person {n}", **fields)
        case _:
            raise AssertionError(kind)
    db.add(row)
    db.commit()
    return row


# Each case: the statistic, records that must count, records that must not.
# One entry is (kind, fields); every entry in `inside` adds exactly 1 to the statistic.
Seed = list[tuple[str, dict[str, Any]]]
CASES: dict[str, tuple[Seed, Seed]] = {
    "total_jobs": (
        [("job", {"status": JobStatus.wishlist}), ("job", {"status": JobStatus.rejected})],
        [("research", {})],
    ),
    "total_research": (
        [
            ("research", {"status": ResearchStatus.discovered}),
            ("research", {"status": ResearchStatus.archived}),
        ],
        [("job", {})],
    ),
    "in_progress": (
        [
            ("job", {"status": JobStatus.preparing}),
            ("job", {"status": JobStatus.applied}),
            ("job", {"status": JobStatus.assessment}),
            ("job", {"status": JobStatus.interview}),
        ],
        [
            ("job", {"status": JobStatus.wishlist}),
            ("job", {"status": JobStatus.offer}),
            ("job", {"status": JobStatus.rejected}),
            ("job", {"status": JobStatus.withdrawn}),
            ("research", {"status": ResearchStatus.applied}),
        ],
    ),
    "interviews_scheduled": (
        [
            ("job", {"interview_at": NOW + timedelta(minutes=1)}),
            ("job", {"interview_at": NOW + timedelta(days=30)}),
        ],
        [
            ("job", {"interview_at": NOW - timedelta(minutes=1)}),
            ("job", {"interview_at": NOW}),
            ("job", {"interview_at": None}),
        ],
    ),
    "offers": (
        [
            ("job", {"status": JobStatus.offer}),
            ("research", {"status": ResearchStatus.accepted}),
        ],
        [
            ("job", {"status": JobStatus.applied}),
            ("research", {"status": ResearchStatus.interview}),
        ],
    ),
    "rejected": (
        [
            ("job", {"status": JobStatus.rejected}),
            ("research", {"status": ResearchStatus.rejected}),
        ],
        [
            ("job", {"status": JobStatus.withdrawn}),
            ("research", {"status": ResearchStatus.archived}),
        ],
    ),
    "upcoming_deadlines": (
        [
            ("job", {"status": JobStatus.preparing, "deadline": days(0)}),
            ("job", {"status": JobStatus.wishlist, "deadline": days(14)}),
            ("research", {"deadline": days(14)}),
            ("reminder", {"due_at": NOW + timedelta(hours=1)}),
            ("reminder", {"due_at": NOW + timedelta(days=14)}),
        ],
        [
            ("job", {"deadline": days(-1)}),
            ("job", {"deadline": days(15)}),
            ("job", {"deadline": None}),
            ("research", {"deadline": days(-1)}),
            ("research", {"deadline": days(15)}),
            # Earlier today is overdue, not upcoming: reminders compare instants.
            ("reminder", {"due_at": NOW - timedelta(hours=6)}),
            ("reminder", {"due_at": NOW + timedelta(days=14, seconds=1)}),
            ("reminder", {"due_at": NOW + timedelta(hours=1), "is_completed": True}),
        ],
    ),
    "pending_follow_ups": (
        [
            ("job", {"status": JobStatus.applied, "follow_up_date": days(-3)}),
            ("job", {"status": JobStatus.interview, "follow_up_date": days(7)}),
            ("contact", {"next_follow_up_at": days(-1)}),
            ("contact", {"next_follow_up_at": days(7)}),
        ],
        [
            ("job", {"status": JobStatus.applied, "follow_up_date": days(8)}),
            ("job", {"status": JobStatus.applied, "follow_up_date": None}),
            ("job", {"status": JobStatus.rejected, "follow_up_date": days(-1)}),
            ("contact", {"next_follow_up_at": days(8)}),
            ("contact", {"next_follow_up_at": None}),
        ],
    ),
}


def test_empty_account_returns_zeros_and_12_empty_months(db):
    user = make_user(db)
    assert service.summary(db, user, NOW) == dict.fromkeys(SUMMARY_KEYS, 0)
    assert service.upcoming_deadlines(db, user, NOW) == []
    assert service.recent_activities(db, user) == []

    analytics = service.analytics(db, user, NOW)
    months = analytics["monthly"]
    assert [m["month"] for m in months] == [
        "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05",
        "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11",
    ]  # fmt: skip
    assert all(m["jobs"] == 0 and m["research"] == 0 for m in months)
    assert {s["status"]: s["count"] for s in analytics["job_status"]} == {
        s.value: 0 for s in JobStatus
    }
    assert {s["status"]: s["count"] for s in analytics["research_status"]} == {
        s.value: 0 for s in ResearchStatus
    }


@pytest.mark.parametrize("stat", STAT_KEYS)
def test_each_summary_number_matches_spec_definition(db, stat):
    user = make_user(db)
    other = make_user(db, "bob@x.com")
    inside, outside = CASES[stat]
    for kind, fields in inside + outside:
        add(db, user, kind, **fields)
    # Matching records of another user never count.
    for kind, fields in inside:
        add(db, other, kind, **fields)

    assert service.summary(db, user, NOW)[stat] == len(inside)


def test_deadline_today_is_upcoming_and_day_15_is_not(db):
    user = make_user(db)
    today = add(db, user, "job", deadline=days(0))
    last = add(db, user, "research", deadline=days(14))
    add(db, user, "job", deadline=days(15))
    add(db, user, "job", deadline=days(-1))

    items = service.upcoming_deadlines(db, user, NOW)
    assert [i["id"] for i in items] == [today.id, last.id]
    assert service.summary(db, user, NOW)["upcoming_deadlines"] == 2
    # Late in the UTC day the date still counts as today.
    late = NOW.replace(hour=23, minute=59)
    assert service.summary(db, user, late)["upcoming_deadlines"] == 2


def test_deadline_list_and_summary_count_return_the_same_set(db):
    user = make_user(db)
    inside, outside = CASES["upcoming_deadlines"]
    inside_rows = [add(db, user, kind, **fields) for kind, fields in inside]
    for kind, fields in outside:
        add(db, user, kind, **fields)

    items = service.upcoming_deadlines(db, user, NOW)
    assert len(items) == service.summary(db, user, NOW)["upcoming_deadlines"] == len(inside)
    assert {i["id"] for i in items} == {r.id for r in inside_rows}


def test_upcoming_deadlines_shape_and_order(db):
    user = make_user(db)
    job = add(db, user, "job", deadline=days(3))
    study = add(db, user, "research", deadline=days(1))
    linked = add(
        db,
        user,
        "reminder",
        due_at=NOW + timedelta(days=2, hours=5),
        related_type="job",
        related_id=job.id,
    )
    free = add(db, user, "reminder", due_at=NOW + timedelta(hours=3))

    items = service.upcoming_deadlines(db, user, NOW)
    assert [(i["kind"], i["id"]) for i in items] == [
        ("reminder", free.id),
        ("research_deadline", study.id),
        ("reminder", linked.id),
        ("job_deadline", job.id),
    ]
    by_id = {i["id"]: i for i in items}
    assert by_id[job.id]["title"] == f"Engineer at {job.company_name}"
    assert by_id[job.id]["due"] == days(3)
    assert (by_id[job.id]["related_type"], by_id[job.id]["related_id"]) == ("job", job.id)
    assert by_id[study.id]["title"] == f"{study.title} ({study.organization})"
    assert by_id[linked.id]["due"] == linked.due_at
    assert (by_id[linked.id]["related_type"], by_id[linked.id]["related_id"]) == ("job", job.id)
    assert (by_id[free.id]["related_type"], by_id[free.id]["related_id"]) == (None, None)


@pytest.mark.parametrize("status", ["offer", "rejected", "withdrawn"])
def test_inactive_records_do_not_count_as_upcoming_deadlines(db, status):
    user = make_user(db)
    add(db, user, "job", status=status, deadline=days(2))
    assert service.summary(db, user, NOW)["upcoming_deadlines"] == 0
    assert service.upcoming_deadlines(db, user, NOW) == []


@pytest.mark.parametrize("status", ["accepted", "rejected", "archived"])
def test_inactive_research_does_not_count_as_upcoming_deadline(db, status):
    user = make_user(db)
    add(db, user, "research", status=status, deadline=days(2))
    assert service.summary(db, user, NOW)["upcoming_deadlines"] == 0
    assert service.upcoming_deadlines(db, user, NOW) == []


def test_completed_reminders_do_not_count(db):
    user = make_user(db)
    add(db, user, "reminder", due_at=NOW + timedelta(days=1), is_completed=True)
    assert service.summary(db, user, NOW)["upcoming_deadlines"] == 0
    assert service.upcoming_deadlines(db, user, NOW) == []
    add(db, user, "reminder", due_at=NOW + timedelta(days=1))
    assert service.summary(db, user, NOW)["upcoming_deadlines"] == 1


def test_overdue_follow_ups_count_and_day_8_does_not(db):
    user = make_user(db)
    add(db, user, "job", status="applied", follow_up_date=days(-30))
    add(db, user, "contact", next_follow_up_at=days(-1))
    assert service.summary(db, user, NOW)["pending_follow_ups"] == 2
    add(db, user, "job", status="applied", follow_up_date=days(8))
    add(db, user, "contact", next_follow_up_at=days(8))
    assert service.summary(db, user, NOW)["pending_follow_ups"] == 2
    add(db, user, "job", status="applied", follow_up_date=days(7))
    assert service.summary(db, user, NOW)["pending_follow_ups"] == 3


def test_monthly_excludes_records_without_application_date(db):
    user = make_user(db)
    add(db, user, "job", application_date=date(2026, 11, 1))
    add(db, user, "job", application_date=date(2026, 11, 30))
    add(db, user, "job", application_date=date(2025, 12, 1))
    add(db, user, "job", application_date=date(2025, 11, 30))  # before the window
    add(db, user, "job", application_date=date(2026, 12, 1))  # after the window
    add(db, user, "job", application_date=None)
    add(db, user, "research", application_date=date(2026, 3, 15))
    add(db, user, "research", application_date=None)

    monthly = {m["month"]: m for m in service.analytics(db, user, NOW)["monthly"]}
    assert len(monthly) == 12
    assert monthly["2026-11"]["jobs"] == 2
    assert monthly["2025-12"]["jobs"] == 1
    assert monthly["2026-03"]["research"] == 1
    assert sum(m["jobs"] for m in monthly.values()) == 3
    assert sum(m["research"] for m in monthly.values()) == 1


def test_analytics_status_counts(db):
    user = make_user(db)
    add(db, user, "job", status="applied")
    add(db, user, "job", status="applied")
    add(db, user, "job", status="offer")
    add(db, user, "research", status="accepted")

    analytics = service.analytics(db, user, NOW)
    jobs = {s["status"]: s["count"] for s in analytics["job_status"]}
    research = {s["status"]: s["count"] for s in analytics["research_status"]}
    assert jobs["applied"] == 2 and jobs["offer"] == 1 and jobs["wishlist"] == 0
    assert research["accepted"] == 1 and research["discovered"] == 0


def test_dashboard_excludes_other_users_records(db):
    ana = make_user(db)
    bob = make_user(db, "bob@x.com")
    add(db, bob, "job", status="applied", deadline=days(1), follow_up_date=days(1),
        application_date=date(2026, 11, 2), interview_at=NOW + timedelta(days=1))  # fmt: skip
    add(db, bob, "research", status="accepted", deadline=days(1), application_date=days(-1))
    add(db, bob, "reminder", due_at=NOW + timedelta(days=1))
    add(db, bob, "contact", next_follow_up_at=days(1))
    db.add(ActivityLog(user_id=bob.id, entity_type="job", entity_id=uuid.uuid4(), action="x"))
    db.commit()

    assert service.summary(db, ana, NOW) == dict.fromkeys(SUMMARY_KEYS, 0)
    assert service.upcoming_deadlines(db, ana, NOW) == []
    assert service.recent_activities(db, ana) == []
    analytics = service.analytics(db, ana, NOW)
    assert all(m["jobs"] == 0 and m["research"] == 0 for m in analytics["monthly"])
    assert all(s["count"] == 0 for s in analytics["job_status"] + analytics["research_status"])
    assert service.summary(db, bob, NOW)["total_jobs"] == 1


def test_non_utc_now_uses_the_utc_date(db):
    user = make_user(db)
    add(db, user, "job", deadline=days(0))
    # 2026-11-07 01:00 in UTC+10 is still 2026-11-06 in UTC, so the deadline is today.
    local = datetime(2026, 11, 6, 15, 0, tzinfo=UTC).astimezone(timezone(timedelta(hours=10)))
    assert local.date() != TODAY
    assert service.summary(db, user, local)["upcoming_deadlines"] == 1


def test_recent_activities_newest_first_and_limited(db):
    user = make_user(db)
    entity = uuid.uuid4()
    for i in range(12):
        db.add(
            ActivityLog(
                user_id=user.id,
                entity_type="job",
                entity_id=entity,
                action=f"a{i}",
                created_at=NOW + timedelta(minutes=i),
            )
        )
    db.commit()
    rows = service.recent_activities(db, user)
    assert [r.action for r in rows] == [f"a{i}" for i in range(11, 1, -1)]


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


def test_endpoints_require_login(client):
    for path in ("summary", "upcoming-deadlines", "recent-activities", "analytics"):
        r = client.get(f"{DASHBOARD}/{path}")
        assert r.status_code == 401, path
        assert r.json()["error"]["code"] == "unauthorized"


def test_endpoints_shape_for_a_new_account(ana):
    summary = ana.get(f"{DASHBOARD}/summary")
    assert summary.status_code == 200
    assert summary.json() == dict.fromkeys(SUMMARY_KEYS, 0)
    assert ana.get(f"{DASHBOARD}/upcoming-deadlines").json() == []
    assert ana.get(f"{DASHBOARD}/recent-activities").json() == []
    analytics = ana.get(f"{DASHBOARD}/analytics").json()
    assert set(analytics) == {"job_status", "research_status", "monthly"}
    assert len(analytics["monthly"]) == 12


def test_endpoints_reflect_created_records(ana):
    due = (datetime.now(UTC).date() + timedelta(days=2)).isoformat()
    r = ana.post(
        "/api/v1/jobs",
        json={"company_name": "Acme", "position_title": "Dev", "deadline": due,
              "status": "applied", "application_date": datetime.now(UTC).date().isoformat()},
    )  # fmt: skip
    assert r.status_code == 201, r.text

    assert ana.get(f"{DASHBOARD}/summary").json()["upcoming_deadlines"] == 1
    items = ana.get(f"{DASHBOARD}/upcoming-deadlines").json()
    assert [(i["kind"], i["due"], i["title"]) for i in items] == [
        ("job_deadline", due, "Dev at Acme")
    ]
    assert set(items[0]) == {
        "kind", "id", "title", "due", "related_type", "related_id", "project_id", "project_title",
    }  # fmt: skip
    assert ana.get(f"{DASHBOARD}/recent-activities").json()[0]["entity_type"] == "job"
    assert ana.get(f"{DASHBOARD}/analytics").json()["monthly"][-1]["jobs"] == 1


def _job_due(client, deadline: date) -> None:
    r = client.post(
        "/api/v1/jobs",
        json={"company_name": "Acme", "position_title": "Dev", "deadline": deadline.isoformat(),
              "status": "applied"},
    )  # fmt: skip
    assert r.status_code == 201, r.text


def test_deadline_on_the_clients_today_counts_after_utc_has_moved_on(ana):
    # A browser west of UTC: its local date is the day before the UTC date.
    utc_today = datetime.now(UTC).date()
    client_today = utc_today - timedelta(days=1)
    _job_due(ana, client_today)

    assert ana.get(f"{DASHBOARD}/summary").json()["upcoming_deadlines"] == 0
    with_today = {"today": client_today.isoformat()}
    assert ana.get(f"{DASHBOARD}/summary", params=with_today).json()["upcoming_deadlines"] == 1
    items = ana.get(f"{DASHBOARD}/upcoming-deadlines", params=with_today).json()
    assert [i["due"] for i in items] == [client_today.isoformat()]


def test_today_one_day_ahead_of_utc_is_accepted_and_shifts_the_window(ana):
    utc_today = datetime.now(UTC).date()
    _job_due(ana, utc_today)  # due today in UTC, already past for a client east of UTC
    east = {"today": (utc_today + timedelta(days=1)).isoformat()}
    assert ana.get(f"{DASHBOARD}/summary", params=east).json()["upcoming_deadlines"] == 0
    assert ana.get(f"{DASHBOARD}/upcoming-deadlines", params=east).json() == []


@pytest.mark.parametrize("path", ["summary", "upcoming-deadlines"])
@pytest.mark.parametrize("offset", [-2, 2, 400])
def test_today_more_than_a_day_from_utc_returns_422(ana, path, offset):
    bad = (datetime.now(UTC).date() + timedelta(days=offset)).isoformat()
    r = ana.get(f"{DASHBOARD}/{path}", params={"today": bad})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"
    assert r.json()["error"]["details"][0]["loc"] == ["query", "today"]


def test_today_that_is_not_a_date_returns_422(ana):
    r = ana.get(f"{DASHBOARD}/summary", params={"today": "tomorrow"})
    assert r.status_code == 422
