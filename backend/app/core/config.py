import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The repo-root .env, the same file Docker Compose reads, wherever the app is started from.
# Outside a checkout (the container image) it does not exist and the real environment is used.
# Variables set in the environment always take precedence over the file.
REPO_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"

MIN_JWT_SECRET_LENGTH = 32

# Secrets that appear in this public repository (the Compose fallback and the test and CI
# values). They are fine on a developer machine, but they let anyone forge a session, so
# a deployed instance refuses them.
KNOWN_PUBLIC_JWT_SECRETS = frozenset(
    {
        "dev-only-secret-do-not-use-outside-local-compose",
        "test-only-secret-not-for-real-use-0123456789",
        "ci-only-secret-not-for-real-use-0123456789",
    }
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ENV_FILE, extra="ignore")

    DATABASE_URL: str
    JWT_SECRET: str
    COOKIE_SECURE: bool = False
    FRONTEND_ORIGIN: str = "http://localhost:3000"
    TRUST_PROXY: bool = False
    # Per-IP limit on POST /auth/register. Only the end-to-end test environment raises it.
    RATE_LIMIT_REGISTER_PER_MINUTE: int = 5
    # How many Argon2 hashes may run at once. Each takes about 64 MiB, so this bounds the
    # memory spent on hashing. Lower it on small hosts (render.yaml sets 2 for the free plan).
    MAX_CONCURRENT_HASHES: int = Field(default=4, ge=1)

    @field_validator("DATABASE_URL")
    @classmethod
    def _database_url_is_not_blank(cls, value: str) -> str:
        # A blank value (for example a Render secret left empty) would otherwise surface as an
        # obscure SQLAlchemy parse error.
        if not value.strip():
            raise ValueError(
                "DATABASE_URL is empty. Set it to your Postgres connection string, for example "
                "postgresql+psycopg://USER:PASSWORD@HOST/DBNAME?sslmode=require"
            )
        return value

    @field_validator("JWT_SECRET")
    @classmethod
    def _jwt_secret_is_long_enough(cls, value: str) -> str:
        if len(value) < MIN_JWT_SECRET_LENGTH:
            raise ValueError(
                f"JWT_SECRET must be at least {MIN_JWT_SECRET_LENGTH} characters. Generate one "
                'with: python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        return value

    @model_validator(mode="after")
    def _deployed_instance_has_a_private_secret(self) -> "Settings":
        # "Deployed" means HTTPS cookies or Render's own RENDER variable.
        deployed = self.COOKIE_SECURE or bool(os.environ.get("RENDER"))
        if deployed and self.JWT_SECRET in KNOWN_PUBLIC_JWT_SECRETS:
            raise ValueError(
                "JWT_SECRET is a value published in this repository and cannot be used when "
                "COOKIE_SECURE=true or on Render. Generate one with: "
                'python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
