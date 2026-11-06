from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The repo-root .env, the same file Docker Compose reads, wherever the app is started from.
# Outside a checkout (the container image) it does not exist and the real environment is used.
# Variables set in the environment always take precedence over the file.
REPO_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"

MIN_JWT_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ENV_FILE, extra="ignore")

    DATABASE_URL: str
    JWT_SECRET: str
    COOKIE_SECURE: bool = False
    FRONTEND_ORIGIN: str = "http://localhost:3000"
    TRUST_PROXY: bool = False
    # Per-IP limit on POST /auth/register. Only the end-to-end test environment raises it.
    RATE_LIMIT_REGISTER_PER_MINUTE: int = 5

    @field_validator("JWT_SECRET")
    @classmethod
    def _jwt_secret_is_long_enough(cls, value: str) -> str:
        if len(value) < MIN_JWT_SECRET_LENGTH:
            raise ValueError(
                f"JWT_SECRET must be at least {MIN_JWT_SECRET_LENGTH} characters. Generate one "
                'with: python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
