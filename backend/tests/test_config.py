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
