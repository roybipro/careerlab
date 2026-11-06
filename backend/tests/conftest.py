import os
from collections.abc import Iterator

# Settings must be in place before the app modules are imported.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://careerlab:careerlab@localhost:5433/careerlab_test",
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("JWT_SECRET", "test-only-secret-not-for-real-use")
os.environ["COOKIE_SECURE"] = "false"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, inspect, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.db import get_db  # noqa: E402
from app.main import create_app  # noqa: E402

CSRF_HEADERS = {"X-Requested-With": "CareerLab"}

assert make_url(TEST_DATABASE_URL).database == "careerlab_test", (
    "Refusing to run tests against a database other than careerlab_test"
)

engine = create_engine(TEST_DATABASE_URL)


@pytest.fixture(scope="session", autouse=True)
def _migrated_database() -> Iterator[None]:
    command.upgrade(Config("alembic.ini"), "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def _truncate_tables() -> Iterator[None]:
    yield
    tables = [t for t in inspect(engine).get_table_names() if t != "alembic_version"]
    if tables:
        names = ", ".join(f'"{n}"' for n in tables)
        with engine.begin() as conn:
            conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))


@pytest.fixture
def db() -> Iterator[Session]:
    with Session(engine, expire_on_commit=False) as session:
        yield session


@pytest.fixture
def app(db: Session) -> FastAPI:
    application = create_app()
    application.dependency_overrides[get_db] = lambda: db

    @application.get("/api/v1/_test/validate")
    def _validate(n: int) -> dict[str, int]:  # test-only route
        return {"n": n}

    return application


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app, headers=CSRF_HEADERS) as c:
        yield c


@pytest.fixture
def raw_client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c
