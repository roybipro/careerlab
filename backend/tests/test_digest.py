from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.auth.models import User
from app.modules.digest import email, service
from tests.conftest import register_user

API = "/api/v1"
SETTINGS = f"{API}/notifications/email"
RUN = f"{API}/internal/digests"
SECRET = "cron-secret-for-tests"


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


@pytest.fixture
def email_on(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Turns email on with a fake provider and returns the list of emails "sent"."""
    settings = get_settings()
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(settings, "EMAIL_FROM", "CareerLab <digest@example.com>")
    monkeypatch.setattr(settings, "CRON_SECRET", SECRET)
    outbox: list[dict[str, Any]] = []
    monkeypatch.setattr(email, "send_email", lambda **kw: outbox.append(kw))
    return outbox


def day(offset: int) -> str:
    return (date.today() + timedelta(days=offset)).isoformat()


def run(c: TestClient, secret: str = SECRET):
    return c.post(RUN, headers={"Authorization": f"Bearer {secret}"})


def with_work(c: TestClient) -> None:
    c.post(
        f"{API}/jobs", json={"company_name": "Acme", "position_title": "Eng", "deadline": day(3)}
    )
    past = (datetime.now(UTC) - timedelta(hours=2)).isoformat()
    c.post(f"{API}/reminders", json={"title": "Email <prof>", "due_at": past})


def test_settings_off_by_default_and_unavailable_without_provider(ana):
    assert ana.get(SETTINGS).json() == {"enabled": False, "available": False}
    r = ana.put(SETTINGS, json={"enabled": True})
    assert r.status_code == 409
    assert ana.put(SETTINGS, json={"enabled": False}).status_code == 200


def test_turn_on_and_off(ana, email_on):
    assert ana.get(SETTINGS).json() == {"enabled": False, "available": True}
    assert ana.put(SETTINGS, json={"enabled": True}).json() == {"enabled": True, "available": True}
    assert ana.get(SETTINGS).json()["enabled"] is True
    assert ana.put(SETTINGS, json={"enabled": False}).json()["enabled"] is False


def test_run_sends_once_per_day_with_the_users_work(ana, email_on, db: Session):
    with_work(ana)
    ana.put(SETTINGS, json={"enabled": True})

    r = run(ana)
    assert r.status_code == 200, r.text
    assert r.json() == {"sent": 1, "skipped": 0, "failed": 0}
    assert len(email_on) == 1
    sent = email_on[0]
    assert sent["to"] == "ana@x.com"
    assert sent["subject"] == "CareerLab: 1 overdue, 1 due this week"
    assert "Eng at Acme" in sent["text"] and "Email <prof>" in sent["text"]
    # Titles are escaped in the HTML.
    assert "Email &lt;prof&gt;" in sent["html"] and "<prof>" not in sent["html"]
    assert sent["headers"]["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert "/api/v1/notifications/email/unsubscribe?token=" in sent["headers"]["List-Unsubscribe"]

    # A second run the same day sends nothing.
    assert run(ana).json() == {"sent": 0, "skipped": 0, "failed": 0}
    assert len(email_on) == 1
    assert db.scalar(select(User.last_digest_on)) == datetime.now(UTC).date()


def test_nothing_to_say_sends_nothing(ana, email_on):
    ana.put(SETTINGS, json={"enabled": True})
    assert run(ana).json() == {"sent": 0, "skipped": 1, "failed": 0}
    assert email_on == []


def test_users_who_did_not_opt_in_get_nothing(ana, email_on):
    with_work(ana)
    assert run(ana).json() == {"sent": 0, "skipped": 0, "failed": 0}


def test_a_failing_email_is_counted_and_retried_next_run(ana, email_on, monkeypatch):
    with_work(ana)
    ana.put(SETTINGS, json={"enabled": True})

    def boom(**_kw: Any) -> None:
        raise email.EmailError("provider down")

    monkeypatch.setattr(email, "send_email", boom)
    assert run(ana).json() == {"sent": 0, "skipped": 0, "failed": 1}
    monkeypatch.setattr(email, "send_email", lambda **kw: email_on.append(kw))
    assert run(ana).json() == {"sent": 1, "skipped": 0, "failed": 0}


def test_run_needs_the_secret(ana, email_on, monkeypatch):
    assert ana.post(RUN).status_code == 401
    assert run(ana, "wrong").status_code == 401
    monkeypatch.setattr(get_settings(), "CRON_SECRET", "")
    assert run(ana, "").status_code == 404


def test_run_without_provider_is_503(ana, monkeypatch):
    monkeypatch.setattr(get_settings(), "CRON_SECRET", SECRET)
    assert run(ana).status_code == 503


def test_unsubscribe_link_and_one_click(ana, email_on, db: Session, raw_client):
    ana.put(SETTINGS, json={"enabled": True})
    user = db.scalar(select(User))
    assert user is not None
    token = service.unsubscribe_token(user)

    # The link in the email: no session, no CSRF header.
    r = raw_client.get(f"{SETTINGS}/unsubscribe", params={"token": token}, follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"].endswith("/settings?email=unsubscribed")
    assert ana.get(SETTINGS).json()["enabled"] is False

    ana.put(SETTINGS, json={"enabled": True})
    assert raw_client.post(f"{SETTINGS}/unsubscribe", params={"token": token}).status_code == 204
    assert ana.get(SETTINGS).json()["enabled"] is False


def test_unsubscribe_rejects_bad_tokens(ana, raw_client, db: Session):
    import jwt

    r = raw_client.get(f"{SETTINGS}/unsubscribe", params={"token": "nope"}, follow_redirects=False)
    assert r.headers["location"].endswith("/settings?email=invalid-link")
    assert raw_client.post(f"{SETTINGS}/unsubscribe", params={"token": "nope"}).status_code == 400
    user = db.scalar(select(User))
    assert user is not None
    # A session-style token signed with the same key is not an unsubscribe token.
    wrong = jwt.encode({"sub": str(user.id)}, get_settings().JWT_SECRET, algorithm="HS256")
    assert raw_client.post(f"{SETTINGS}/unsubscribe", params={"token": wrong}).status_code == 400


def test_render_lists_sections_and_links():
    user = User(full_name="Ana Lima", email="ana@x.com")
    digest = service.Digest(
        overdue=[service.Line("A", "Reminder, was due Mon", "/reminders?state=overdue")],
        nudges=[service.Line("Acme: Eng", "Waiting 20 days for a reply", "/jobs/1")],
    )
    subject, body_html, body_text = service.render(digest, user, "https://x/unsub")
    assert subject == "CareerLab: 1 overdue, 1 to follow up"
    assert "Hi Ana" in body_text and "Worth a follow-up" in body_text
    assert "Due in the next" not in body_text
    assert 'href="https://x/unsub"' in body_html
