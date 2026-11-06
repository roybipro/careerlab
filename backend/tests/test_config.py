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
