import importlib

import pytest
from pydantic import ValidationError

from app.core.config import Settings

DB_URL = "postgresql+psycopg://u:p@localhost:5433/x"


def test_jwt_secret_shorter_than_32_characters_is_rejected() -> None:
    with pytest.raises(ValidationError, match="at least 32 characters"):
        Settings(_env_file=None, DATABASE_URL=DB_URL, JWT_SECRET="x" * 31)


def test_empty_jwt_secret_is_rejected() -> None:
    with pytest.raises(ValidationError, match="at least 32 characters"):
        Settings(_env_file=None, DATABASE_URL=DB_URL, JWT_SECRET="")


def test_jwt_secret_of_32_characters_is_accepted() -> None:
    settings = Settings(_env_file=None, DATABASE_URL=DB_URL, JWT_SECRET="x" * 32)
    assert settings.JWT_SECRET == "x" * 32


def test_database_url_is_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL")
    with pytest.raises(ValidationError, match="DATABASE_URL"):
        Settings(_env_file=None, JWT_SECRET="x" * 32)


def test_register_rate_limit_defaults_to_5_per_minute() -> None:
    settings = Settings(_env_file=None, DATABASE_URL=DB_URL, JWT_SECRET="x" * 32)
    assert settings.RATE_LIMIT_REGISTER_PER_MINUTE == 5


def test_register_rate_limit_setting_is_honoured_by_the_register_limiter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.core.config import get_settings
    from app.modules.auth import router

    monkeypatch.setenv("RATE_LIMIT_REGISTER_PER_MINUTE", "50")
    get_settings.cache_clear()
    try:
        reloaded = importlib.reload(router)
        assert reloaded._register_ip_limiter.limit == 50
    finally:
        monkeypatch.delenv("RATE_LIMIT_REGISTER_PER_MINUTE")
        get_settings.cache_clear()
        importlib.reload(router)


COMPOSE_FALLBACK = "dev-only-secret-do-not-use-outside-local-compose"
CI_SECRET = "ci-only-secret-not-for-real-use-0123456789"
TEST_SECRET = "test-only-secret-not-for-real-use-0123456789"


@pytest.mark.parametrize("secret", [COMPOSE_FALLBACK, CI_SECRET, TEST_SECRET])
def test_public_jwt_secret_is_rejected_with_secure_cookies(secret: str) -> None:
    with pytest.raises(ValidationError, match="published in this repository"):
        Settings(_env_file=None, DATABASE_URL=DB_URL, JWT_SECRET=secret, COOKIE_SECURE=True)


@pytest.mark.parametrize("secret", [COMPOSE_FALLBACK, CI_SECRET, TEST_SECRET])
def test_public_jwt_secret_is_rejected_on_render(
    secret: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("RENDER", "true")
    with pytest.raises(ValidationError, match="published in this repository"):
        Settings(_env_file=None, DATABASE_URL=DB_URL, JWT_SECRET=secret)


def test_public_jwt_secret_is_still_accepted_for_local_development(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("RENDER", raising=False)
    settings = Settings(_env_file=None, DATABASE_URL=DB_URL, JWT_SECRET=COMPOSE_FALLBACK)
    assert settings.JWT_SECRET == COMPOSE_FALLBACK


def test_private_jwt_secret_is_accepted_when_deployed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RENDER", "true")
    settings = Settings(
        _env_file=None, DATABASE_URL=DB_URL, JWT_SECRET="r" * 48, COOKIE_SECURE=True
    )
    assert settings.JWT_SECRET == "r" * 48


def test_max_concurrent_hashes_defaults_to_4() -> None:
    settings = Settings(_env_file=None, DATABASE_URL=DB_URL, JWT_SECRET="x" * 32)
    assert settings.MAX_CONCURRENT_HASHES == 4


@pytest.mark.parametrize("value", [0, -1])
def test_max_concurrent_hashes_must_be_at_least_1(value: int) -> None:
    with pytest.raises(ValidationError, match="MAX_CONCURRENT_HASHES"):
        Settings(
            _env_file=None, DATABASE_URL=DB_URL, JWT_SECRET="x" * 32, MAX_CONCURRENT_HASHES=value
        )


def test_max_concurrent_hashes_setting_sizes_the_hashing_semaphore(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.core import security
    from app.core.config import get_settings

    monkeypatch.setenv("MAX_CONCURRENT_HASHES", "2")
    get_settings.cache_clear()
    try:
        reloaded = importlib.reload(security)
        assert reloaded.MAX_CONCURRENT_HASHES == 2
        slots = [reloaded._hash_slots.acquire(blocking=False) for _ in range(3)]
        assert slots == [True, True, False]
        reloaded._hash_slots.release()
        reloaded._hash_slots.release()
    finally:
        monkeypatch.delenv("MAX_CONCURRENT_HASHES")
        get_settings.cache_clear()
        importlib.reload(security)


@pytest.mark.parametrize("value", ["", "   "])
def test_blank_database_url_is_rejected_with_a_clear_message(value: str) -> None:
    with pytest.raises(ValidationError, match="DATABASE_URL is empty"):
        Settings(_env_file=None, DATABASE_URL=value, JWT_SECRET="x" * 32)
