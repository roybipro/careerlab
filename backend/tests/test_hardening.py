"""Final-review hardening: limiter bounds, hashing slots, odd input, OpenAPI header."""

import threading
from unittest.mock import patch

import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.rate_limit import MAX_KEY_LENGTH, RateLimiter, client_ip
from tests.conftest import PASSWORD, register_user

BASE = "/api/v1"


def _request(headers: dict[str, str]) -> Request:
    return Request(
        {
            "type": "http",
            "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
            "client": ("10.0.0.1", 1234),
        }
    )


# ---- forwarded client IP


@pytest.mark.parametrize(
    "forwarded",
    ["not-an-ip", "a" * 8000, "1.2.3.4:5678", "999.1.1.1", "<script>", "', 1=1 --"],
)
def test_unparseable_forwarded_entry_falls_back_to_the_socket_address(
    forwarded: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "TRUST_PROXY", True)
    assert client_ip(_request({"X-Forwarded-For": forwarded})) == "10.0.0.1"
    assert client_ip(_request({"X-Forwarded-For": f"{forwarded}, 203.0.113.7"})) == "10.0.0.1"


def test_valid_forwarded_ipv4_and_ipv6_are_used_and_normalised(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(get_settings(), "TRUST_PROXY", True)
    assert client_ip(_request({"X-Forwarded-For": "203.0.113.7"})) == "203.0.113.7"
    assert client_ip(_request({"X-Forwarded-For": "2001:DB8:0:0:0:0:0:1"})) == "2001:db8::1"


# ---- limiter key cap


def test_new_keys_past_the_cap_share_an_overflow_bucket_and_do_not_grow_the_table() -> None:
    limiter = RateLimiter(limit=2, window_seconds=60, max_keys=3)
    with patch("app.core.rate_limit.time.monotonic", return_value=1000.0):
        for key in ("a", "b", "c"):
            limiter.check(key)
        assert len(limiter._hits) == 3
        # Past the cap, new keys are counted together, so they are still limited.
        limiter.check("d")
        limiter.check("e")
        with pytest.raises(AppError) as exc:
            limiter.check("f")
        assert exc.value.status == 429
        for i in range(1000):
            with pytest.raises(AppError):
                limiter.check(f"spoofed-{i}")
        assert len(limiter._hits) == 4  # three real keys plus the overflow bucket
        # A key already tracked keeps its own bucket.
        limiter.check("a")
        with pytest.raises(AppError):
            limiter.check("a")


def test_expired_keys_are_dropped_so_new_keys_get_their_own_bucket_again() -> None:
    limiter = RateLimiter(limit=1, window_seconds=60, max_keys=2)
    with patch("app.core.rate_limit.time.monotonic", return_value=1000.0):
        limiter.check("a")
        limiter.check("b")
    with patch("app.core.rate_limit.time.monotonic", return_value=1100.0):
        limiter.check("c")  # prunes a and b, then c has a bucket of its own
        limiter.check("d")
        assert set(limiter._hits) == {"c", "d"}


def test_a_very_long_key_is_hashed_so_it_cannot_inflate_memory() -> None:
    limiter = RateLimiter(limit=5, window_seconds=60)
    limiter.check("x" * 100_000)
    (stored,) = limiter._hits
    assert len(stored) <= MAX_KEY_LENGTH


def test_login_with_spoofed_forwarded_ips_still_hits_the_limits(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Garbage forwarded values all fall back to one socket address and share its limit."""
    monkeypatch.setattr(get_settings(), "TRUST_PROXY", True)
    statuses = [
        client.post(
            f"{BASE}/auth/login",
            headers={"X-Forwarded-For": f"junk-{i}"},
            json={"email": f"nobody{i}@x.com", "password": PASSWORD},
        ).status_code
        for i in range(12)
    ]
    assert statuses[:10] == [401] * 10
    assert statuses[10:] == [429, 429]


# ---- bounded concurrent hashing


def _saturate(monkeypatch: pytest.MonkeyPatch) -> threading.BoundedSemaphore:
    slots = threading.BoundedSemaphore(1)
    slots.acquire()
    monkeypatch.setattr(security, "_hash_slots", slots)
    monkeypatch.setattr(security, "SLOT_WAIT_SECONDS", 0.05)
    return slots


def test_login_returns_429_when_every_hashing_slot_is_busy(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    register_user(client)
    slots = _saturate(monkeypatch)
    r = client.post(f"{BASE}/auth/login", json={"email": "ana@x.com", "password": PASSWORD})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"
    # Even an unknown email needs a slot, so it cannot be used to skip the bound.
    r = client.post(f"{BASE}/auth/login", json={"email": "who@x.com", "password": PASSWORD})
    assert r.status_code == 429
    slots.release()
    ok = client.post(f"{BASE}/auth/login", json={"email": "ana@x.com", "password": PASSWORD})
    assert ok.status_code == 200


def test_register_and_change_password_return_429_when_slots_are_busy(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    register_user(client)
    slots = _saturate(monkeypatch)
    r = client.post(
        f"{BASE}/auth/register",
        json={"full_name": "Bo", "email": "bo@x.com", "password": PASSWORD},
    )
    assert r.status_code == 429
    r = client.post(
        f"{BASE}/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "another-long-password"},
    )
    assert r.status_code == 429
    slots.release()


def test_slots_are_released_after_use_and_after_errors() -> None:
    hashed = security.hash_password("a-long-enough-password")
    assert security.verify_password("a-long-enough-password", hashed)
    assert not security.verify_password("wrong", hashed)
    assert not security.verify_password("x", "not-a-hash")
    # Every slot is free again: all of them can be taken without waiting.
    taken = [
        security._hash_slots.acquire(blocking=False) for _ in range(security.MAX_CONCURRENT_HASHES)
    ]
    assert all(taken)
    for _ in taken:
        security._hash_slots.release()


def test_a_waiting_request_gets_a_slot_when_one_frees_up_in_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    slots = threading.BoundedSemaphore(1)
    slots.acquire()
    monkeypatch.setattr(security, "_hash_slots", slots)
    monkeypatch.setattr(security, "SLOT_WAIT_SECONDS", 2.0)
    threading.Timer(0.1, slots.release).start()
    assert security.verify_password("x", "not-a-hash") is False  # got a slot, no 429


# ---- NUL characters


@pytest.fixture
def ana(client: TestClient) -> TestClient:
    register_user(client)
    return client


def test_nul_in_a_written_field_returns_422(ana: TestClient, db: Session) -> None:
    r = ana.post(f"{BASE}/jobs", json={"company_name": "Ac\x00me", "position_title": "Dev"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"
    db.rollback()  # the test shares one session; production opens one per request
    job = ana.post(f"{BASE}/jobs", json={"company_name": "Acme", "position_title": "Dev"})
    assert job.status_code == 201
    r = ana.patch(f"{BASE}/jobs/{job.json()['id']}", json={"location": "Li\x00sbon"})
    assert r.status_code == 422
    db.rollback()
    assert ana.get(f"{BASE}/jobs/{job.json()['id']}").json()["location"] is None


def test_nul_in_a_search_filter_returns_422(ana: TestClient, db: Session) -> None:
    for path in ("jobs", "research", "contacts", "reminders"):
        r = ana.get(f"{BASE}/{path}", params={"q": "a\x00b"})
        assert r.status_code == 422, path
        assert r.json()["error"]["code"] == "validation_error"
        db.rollback()
    assert ana.get(f"{BASE}/jobs", params={"company": "a\x00b"}).status_code == 422


def test_nul_in_a_note_returns_422(ana: TestClient, db: Session) -> None:
    job = ana.post(f"{BASE}/jobs", json={"company_name": "Acme", "position_title": "Dev"}).json()
    r = ana.post(
        f"{BASE}/notes",
        json={"entity_type": "job", "entity_id": job["id"], "content": "hi\x00there"},
    )
    assert r.status_code == 422
    db.rollback()


# ---- timestamp years

EXTREMES = ["0001-01-01T00:00:00+14:00", "9999-12-31T23:59:59-14:00", "1899-12-31T23:59:59Z"]


@pytest.mark.parametrize("value", EXTREMES)
def test_reminder_due_at_with_an_extreme_year_returns_422(ana: TestClient, value: str) -> None:
    r = ana.post(f"{BASE}/reminders", json={"title": "x", "due_at": value})
    assert r.status_code == 422
    assert r.json()["error"]["details"][0]["loc"] == ["body", "due_at"]
    ok = ana.post(f"{BASE}/reminders", json={"title": "x", "due_at": "2030-01-01T00:00:00Z"})
    assert ok.status_code == 201
    r = ana.patch(f"{BASE}/reminders/{ok.json()['id']}", json={"due_at": value})
    assert r.status_code == 422
    assert ana.get(f"{BASE}/reminders").status_code == 200


@pytest.mark.parametrize("value", EXTREMES)
def test_job_interview_at_with_an_extreme_year_returns_422(ana: TestClient, value: str) -> None:
    base = {"company_name": "A", "position_title": "B"}
    r = ana.post(f"{BASE}/jobs", json={**base, "interview_at": value})
    assert r.status_code == 422
    assert r.json()["error"]["details"][0]["loc"] == ["body", "interview_at"]
    ok = ana.post(f"{BASE}/jobs", json={**base, "interview_at": "2030-01-01T10:00:00+02:00"})
    assert ok.status_code == 201
    r = ana.patch(f"{BASE}/jobs/{ok.json()['id']}", json={"interview_at": value})
    assert r.status_code == 422
    assert ana.get(f"{BASE}/jobs").status_code == 200


# ---- OpenAPI declares the CSRF header on unsafe operations only


def test_openapi_declares_the_csrf_header_on_post_patch_and_delete_only(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    checked = set()
    for path, item in schema["paths"].items():
        for method, operation in item.items():
            names = [p["name"] for p in operation.get("parameters", []) if p["in"] == "header"]
            if method in ("post", "patch", "delete"):
                assert names.count("X-Requested-With") == 1, (method, path)
                param = next(p for p in operation["parameters"] if p["name"] == "X-Requested-With")
                assert param["required"] is True
                assert param["schema"]["default"] == "CareerLab"
            else:
                assert "X-Requested-With" not in names, (method, path)
            checked.add(method)
    assert {"get", "post", "patch", "delete"} <= checked
    # The schema is built once; a second request must not add the header again.
    again = client.get("/openapi.json").json()
    assert again == schema


def test_missing_raw_csrf_header_is_still_rejected(raw_client: TestClient) -> None:
    r = raw_client.post(f"{BASE}/auth/login", json={"email": "ana@x.com", "password": PASSWORD})
    assert r.status_code == 403
    ok = raw_client.post(
        f"{BASE}/auth/login",
        headers={"X-Requested-With": "CareerLab"},
        json={"email": "ana@x.com", "password": PASSWORD},
    )
    assert ok.status_code == 401  # passed the CSRF check, wrong credentials
