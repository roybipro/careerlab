from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+psycopg://careerlab:careerlab@localhost:5433/careerlab"
    JWT_SECRET: str
    COOKIE_SECURE: bool = False
    FRONTEND_ORIGIN: str = "http://localhost:3000"
    TRUST_PROXY: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
