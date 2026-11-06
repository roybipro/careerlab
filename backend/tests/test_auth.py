from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.rate_limit import RateLimiter, client_ip
from tests.conftest import PASSWORD, register_user

BASE = "/api/v1/auth"
COOKIE = "careerlab_session"


def test_register_sets_httponly_cookie_and_returns_user_without_hash(client: TestClient) -> None:
    response = client.post(
        f"{BASE}/register",
        json={"full_name": "Ana Lima", "email": "ana@x.com", "password": PASSWORD},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "ana@x.com"
    assert body["full_name"] == "Ana Lima"
    assert "id" in body
    assert "password" not in body and "password_hash" not in body and "token_version" not in body
    cookie = response.headers["set-cookie"].lower()
    assert f"{COOKIE}=" in cookie
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "max-age=604800" in cookie
    assert "secure" not in cookie.replace("samesite", "")
    assert client.get(f"{BASE}/me").json()["email"] == "ana@x.com"


def test_register_duplicate_email_any_case_returns_409(client: TestClient) -> None:
    register_user(client, "ana@x.com")
    response = client.post(
        f"{BASE}/register",
        json={"full_name": "Ana", "email": "Ana@X.com", "password": PASSWORD},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


def test_concurrent_duplicate_register_returns_409(client: TestClient) -> None:
    register_user(client, "ana@x.com")
    # Simulate the race: the pre-check sees no user, so the unique index must catch it.
    with patch("app.modules.auth.service.get_user_by_email", return_value=None):
        response = client.post(
            f"{BASE}/register",
            json={"full_name": "Ana", "email": "ana@x.com", "password": PASSWORD},
        )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


def test_login_is_case_insensitive(client: TestClient) -> None:
    register_user(client, "ana@x.com")
    client.post(f"{BASE}/logout")
    response = client.post(f"{BASE}/login", json={"email": "ANA@x.COM", "password": PASSWORD})
    assert response.status_code == 200
    assert response.json()["email"] == "ana@x.com"
    assert client.get(f"{BASE}/me").status_code == 200


def test_login_wrong_password_and_unknown_email_return_same_401_message(
    client: TestClient,
) -> None:
    register_user(client, "ana@x.com")
    wrong = client.post(f"{BASE}/login", json={"email": "ana@x.com", "password": "nope-nope-nope"})
    unknown = client.post(f"{BASE}/login", json={"email": "who@x.com", "password": PASSWORD})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


@pytest.mark.parametrize("password", ["a" * 9, "a" * 129])
def test_password_shorter_than_10_or_longer_than_128_returns_422(
    client: TestClient, password: str
) -> None:
    response = client.post(
        f"{BASE}/register",
        json={"full_name": "Ana", "email": "ana@x.com", "password": password},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_password_boundaries_10_and_128_are_accepted(client: TestClient) -> None:
    for email, length in (("a@x.com", 10), ("b@x.com", 128)):
        response = client.post(
            f"{BASE}/register",
            json={"full_name": "Ana", "email": email, "password": "p" * length},
        )
        assert response.status_code == 201


def test_me_requires_auth(client: TestClient) -> None:
    response = client.get(f"{BASE}/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_update_profile(client: TestClient, second_client: TestClient) -> None:
    register_user(client, "ana@x.com")
    response = client.patch(f"{BASE}/me", json={"full_name": "Ana Maria", "email": "AnaM@x.com"})
    assert response.status_code == 200
    assert response.json()["full_name"] == "Ana Maria"
    assert response.json()["email"] == "anam@x.com"
    assert client.get(f"{BASE}/me").json()["email"] == "anam@x.com"

    taken = client.patch(f"{BASE}/me", json={"email": "BOB@x.com"})
    assert taken.status_code == 409
    # Keeping your own email is not a conflict.
    assert client.patch(f"{BASE}/me", json={"email": "anam@x.com"}).status_code == 200
    # Nothing was changed by the failed attempt.
    assert client.get(f"{BASE}/me").json()["email"] == "anam@x.com"


def test_change_password_requires_current_password(client: TestClient) -> None:
    register_user(client)
    response = client.post(
        f"{BASE}/change-password",
        json={"current_password": "wrong-wrong-wrong", "new_password": "brand-new-password"},
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert error["details"][0]["loc"] == ["body", "current_password"]
    # The session is still valid: a wrong password must not look like an expired login.
    assert client.get(f"{BASE}/me").status_code == 200
    client.post(f"{BASE}/logout")
    ok = client.post(f"{BASE}/login", json={"email": "ana@x.com", "password": PASSWORD})
    assert ok.status_code == 200


def test_change_password_invalidates_old_tokens_but_keeps_this_session(
    client: TestClient, app: FastAPI
) -> None:
    register_user(client)
    old_token = client.cookies[COOKIE]
    response = client.post(
        f"{BASE}/change-password",
        json={"current_password": PASSWORD, "new_password": "brand-new-password"},
    )
    assert response.status_code == 204
    assert client.cookies[COOKIE] != old_token
    assert client.get(f"{BASE}/me").status_code == 200

    with TestClient(app, headers={"X-Requested-With": "CareerLab"}) as other:
        other.cookies.set(COOKIE, old_token)
        assert other.get(f"{BASE}/me").status_code == 401

    client.post(f"{BASE}/logout")
    assert (
        client.post(
            f"{BASE}/login", json={"email": "ana@x.com", "password": "brand-new-password"}
        ).status_code
        == 200
    )
    assert (
        client.post(f"{BASE}/login", json={"email": "ana@x.com", "password": PASSWORD}).status_code
        == 401
    )


def test_logout_clears_cookie(client: TestClient) -> None:
    register_user(client)
    response = client.post(f"{BASE}/logout")
    assert response.status_code == 204
    set_cookie = response.headers["set-cookie"].lower()
    assert f"{COOKIE}=" in set_cookie and "max-age=0" in set_cookie
    assert client.get(f"{BASE}/me").status_code == 401


def test_expired_or_tampered_token_returns_401(client: TestClient) -> None:
    body = register_user(client)
    secret = get_settings().JWT_SECRET
    now = datetime.now(UTC)
    expired = jwt.encode(
        {"sub": body["id"], "ver": 0, "exp": now - timedelta(seconds=5)}, secret, "HS256"
    )
    forged = jwt.encode(
        {"sub": body["id"], "ver": 0, "exp": now + timedelta(days=1)},
        "other-secret-xxxxxxxxxxxxxxxxxxxxxxxx",
        "HS256",
    )
    header, payload, signature = client.cookies[COOKIE].split(".")
    flipped = "A" if signature[0] != "A" else "B"
    tampered = ".".join([header, payload, flipped + signature[1:]])
    for bad in (expired, forged, tampered, "garbage"):
        client.cookies.clear()
        client.cookies.set(COOKIE, bad)
        response = client.get(f"{BASE}/me")
        assert response.status_code == 401, bad
        assert response.json()["error"]["code"] == "unauthorized"


def test_mutation_without_csrf_header_returns_403(raw_client: TestClient) -> None:
    payload = {"full_name": "Ana", "email": "ana@x.com", "password": PASSWORD}
    response = raw_client.post(f"{BASE}/register", json=payload)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"
    assert raw_client.post(f"{BASE}/logout").status_code == 403
    assert raw_client.patch(f"{BASE}/me", json={"full_name": "X"}).status_code == 403
    # Reads do not need the header.
    assert raw_client.get(f"{BASE}/me").status_code == 401


def test_login_limit_5_per_minute_per_email_returns_429(client: TestClient) -> None:
    register_user(client)
    attempt = {"email": "ana@x.com", "password": "wrong-wrong-wrong"}
    for _ in range(5):
        assert client.post(f"{BASE}/login", json=attempt).status_code == 401
    blocked = client.post(f"{BASE}/login", json={**attempt, "email": "ANA@x.com"})
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rate_limited"
    # A different email is unaffected.
    other = client.post(f"{BASE}/login", json={**attempt, "email": "someone@x.com"})
    assert other.status_code == 401


def test_login_limit_10_per_minute_per_ip_returns_429(client: TestClient) -> None:
    for i in range(10):
        r = client.post(f"{BASE}/login", json={"email": f"u{i}@x.com", "password": PASSWORD})
        assert r.status_code == 401
    assert (
        client.post(f"{BASE}/login", json={"email": "u99@x.com", "password": PASSWORD}).status_code
        == 429
    )


def test_register_limit_5_per_minute_per_ip_returns_429(client: TestClient) -> None:
    for i in range(5):
        register_user(client, f"user{i}@x.com")
    response = client.post(
        f"{BASE}/register",
        json={"full_name": "Ana", "email": "user5@x.com", "password": PASSWORD},
    )
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"


def test_rate_limiter_window_expires() -> None:
    limiter = RateLimiter(limit=2, window_seconds=60)
    with patch("app.core.rate_limit.time.monotonic", return_value=1000.0):
        limiter.check("k")
        limiter.check("k")
        with pytest.raises(AppError) as exc:
            limiter.check("k")
        assert exc.value.status == 429
    with patch("app.core.rate_limit.time.monotonic", return_value=1061.0):
        limiter.check("k")


def _request(headers: dict[str, str]) -> Request:
    return Request(
        {
            "type": "http",
            "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
            "client": ("10.0.0.1", 1234),
        }
    )


def test_client_ip_uses_forwarded_for_only_when_proxy_is_trusted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = _request({"X-Forwarded-For": "203.0.113.7, 10.1.1.1"})
    monkeypatch.setattr(get_settings(), "TRUST_PROXY", False)
    assert client_ip(request) == "10.0.0.1"
    monkeypatch.setattr(get_settings(), "TRUST_PROXY", True)
    assert client_ip(request) == "203.0.113.7"
    assert client_ip(_request({})) == "10.0.0.1"


def test_register_global_backstop_returns_429(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "TRUST_PROXY", True)
    for i in range(30):
        response = client.post(
            f"{BASE}/register",
            headers={"X-Forwarded-For": f"203.0.113.{i}"},
            json={"full_name": "Ana", "email": f"user{i}@x.com", "password": PASSWORD},
        )
        assert response.status_code == 201, i
    blocked = client.post(
        f"{BASE}/register",
        headers={"X-Forwarded-For": "198.51.100.99"},
        json={"full_name": "Ana", "email": "user99@x.com", "password": PASSWORD},
    )
    assert blocked.status_code == 429
