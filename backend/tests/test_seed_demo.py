"""The demo seed refuses unsafe runs before it touches the database."""

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.activity.models import ActivityLog
from app.modules.contacts.models import Contact
from app.modules.dashboard import service as dashboard_service
from app.modules.jobs.models import JobApplication
from app.modules.reminders.models import Reminder
from app.modules.research.models import ResearchOpportunity
from scripts import seed_demo

REMOTE_URL = "postgresql+psycopg://user:s3cret-value@ep-demo.example.neon.tech/careerlab"


def _patch_settings(monkeypatch: pytest.MonkeyPatch, url: str) -> None:
    monkeypatch.setattr(seed_demo, "get_settings", lambda: SimpleNamespace(DATABASE_URL=url))


def _engine_must_not_be_used(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom() -> Any:
        raise AssertionError("the database was touched")

    monkeypatch.setattr(seed_demo, "get_engine", boom)


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "[::1]", "db"])
def test_local_hosts_are_allowed(host: str) -> None:
    seed_demo.check_target(f"postgresql+psycopg://u:p@{host}:5432/x", allow_remote=False)


def test_remote_host_is_refused() -> None:
    with pytest.raises(seed_demo.SeedError, match="ep-demo.example.neon.tech"):
        seed_demo.check_target(REMOTE_URL, allow_remote=False)


def test_remote_host_is_allowed_with_the_flag() -> None:
    seed_demo.check_target(REMOTE_URL, allow_remote=True)


def test_main_refuses_a_remote_database(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _patch_settings(monkeypatch, REMOTE_URL)
    _engine_must_not_be_used(monkeypatch)
    code = seed_demo.main([], {"DEMO_PASSWORD": "a-long-enough-password"})
    err = capsys.readouterr().err
    assert code == 1
    assert "Refusing" in err
    assert "s3cret-value" not in err  # credentials in the URL are never printed


def test_main_exits_clearly_without_a_password(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _patch_settings(monkeypatch, "postgresql+psycopg://u:p@localhost:5433/x")
    _engine_must_not_be_used(monkeypatch)
    code = seed_demo.main([], {})
    assert code == 1
    assert "DEMO_PASSWORD is not set" in capsys.readouterr().err


def test_main_rejects_a_password_that_is_too_short(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _patch_settings(monkeypatch, "postgresql+psycopg://u:p@localhost:5433/x")
    _engine_must_not_be_used(monkeypatch)
    assert seed_demo.main([], {"DEMO_PASSWORD": "short"}) == 1
    assert "10 to 128" in capsys.readouterr().err


def test_seed_fills_the_account_and_a_second_run_changes_nothing(
    db: Session, capsys: pytest.CaptureFixture[str]
) -> None:
    today = datetime.now(UTC).date()
    user = seed_demo.seed(db, "a-long-enough-password", today)

    def count(model: Any) -> int:
        return (
            db.scalar(select(func.count()).select_from(model).where(model.user_id == user.id)) or 0
        )

    assert count(JobApplication) >= 8
    assert count(ResearchOpportunity) >= 6
    assert count(Contact) >= 5
    assert count(Reminder) >= 5
    assert count(ActivityLog) > 20
    summary = dashboard_service.summary(db, user)
    assert summary["upcoming_deadlines"] > 0
    assert summary["interviews_scheduled"] > 0

    code = seed_demo.main([], {"DEMO_PASSWORD": "a-long-enough-password"})
    assert code == 1
    assert "already exists" in capsys.readouterr().err
    assert count(JobApplication) >= 8
