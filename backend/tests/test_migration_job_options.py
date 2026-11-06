"""Migration 0005 upgrades, and downgrades without failing on rows that use the new values."""

import uuid

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from tests.conftest import engine

NEW_COLUMNS = {
    "source",
    "start_date",
    "end_date",
    "pay_period",
    "visa_sponsorship",
    "academic_credit",
}
NEW_TYPES = ("co_op", "apprenticeship", "freelance", "graduate_program")


def _columns() -> set[str]:
    return {c["name"] for c in inspect(engine).get_columns("job_applications")}


def _insert_job(employment_type: str) -> uuid.UUID:
    job_id, user_id = uuid.uuid4(), uuid.uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO users (id, full_name, email, password_hash) VALUES (:u, 'M', :e, 'x')"
            ),
            {"u": user_id, "e": f"m-{user_id}@example.com"},
        )
        conn.execute(
            text(
                "INSERT INTO job_applications (id, user_id, company_name, position_title, "
                "employment_type) VALUES (:id, :u, 'Acme', 'Role', :t)"
            ),
            {"id": job_id, "u": user_id, "t": employment_type},
        )
    return job_id


def test_downgrade_nulls_new_employment_types_then_upgrade_restores_head() -> None:
    config = Config("alembic.ini")
    kept = _insert_job("internship")
    moved = [_insert_job(t) for t in NEW_TYPES]
    try:
        command.downgrade(config, "0004")
        assert NEW_COLUMNS.isdisjoint(_columns())
        with engine.connect() as conn:
            for job_id in moved:
                value = conn.execute(
                    text("SELECT employment_type FROM job_applications WHERE id = :i"),
                    {"i": job_id},
                ).scalar_one_or_none()
                assert value is None
            old = conn.execute(
                text("SELECT employment_type FROM job_applications WHERE id = :i"), {"i": kept}
            ).scalar_one()
            assert old == "internship"
        # The old CHECK is back: a new value is refused again.
        with pytest.raises(IntegrityError), engine.begin() as conn:
            conn.execute(
                text("UPDATE job_applications SET employment_type = 'co_op' WHERE id = :i"),
                {"i": kept},
            )
    finally:
        command.upgrade(config, "head")
    assert NEW_COLUMNS <= _columns()
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE job_applications SET employment_type = 'co_op' WHERE id = :i"),
            {"i": kept},
        )
        with pytest.raises(IntegrityError), conn.begin_nested():
            conn.execute(
                text("UPDATE job_applications SET employment_type = 'nonsense' WHERE id = :i"),
                {"i": kept},
            )
