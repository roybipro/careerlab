"""Migration 0006 upgrades and downgrades, and keeps rows that do not point at a project."""

import uuid

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from tests.conftest import engine

TABLES = {"research_projects", "project_submissions", "project_milestones"}


def _tables() -> set[str]:
    return set(inspect(engine).get_table_names())


def _seed() -> dict[str, uuid.UUID]:
    ids = {k: uuid.uuid4() for k in ("user", "job", "keep_note", "keep_rem", "p_note", "p_rem")}
    project = uuid.uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO users (id, full_name, email, password_hash) VALUES (:u, 'M', :e, 'x')"
            ),
            {"u": ids["user"], "e": f"m-{ids['user']}@example.com"},
        )
        conn.execute(
            text(
                "INSERT INTO job_applications (id, user_id, company_name, position_title) "
                "VALUES (:id, :u, 'Acme', 'Role')"
            ),
            {"id": ids["job"], "u": ids["user"]},
        )
        conn.execute(
            text(
                "INSERT INTO notes (id, user_id, entity_type, entity_id, content) VALUES "
                "(:a, :u, 'job', :j, 'keep'), (:b, :u, 'project', :p, 'drop')"
            ),
            {
                "a": ids["keep_note"],
                "b": ids["p_note"],
                "u": ids["user"],
                "j": ids["job"],
                "p": project,
            },
        )
        conn.execute(
            text(
                "INSERT INTO reminders (id, user_id, title, due_at, related_type, related_id) "
                "VALUES (:a, :u, 'keep', now(), 'job', :j), (:b, :u, 'drop', now(), 'project', :p)"
            ),
            {
                "a": ids["keep_rem"],
                "b": ids["p_rem"],
                "u": ids["user"],
                "j": ids["job"],
                "p": project,
            },
        )
        conn.execute(
            text(
                "INSERT INTO activity_logs (id, user_id, entity_type, entity_id, action, metadata) "
                "VALUES (gen_random_uuid(), :u, 'project', :p, 'created', '{}'), "
                "(gen_random_uuid(), :u, 'job', :j, 'created', '{}')"
            ),
            {"u": ids["user"], "j": ids["job"], "p": project},
        )
    return ids


def _count(sql: str, **params) -> int:
    with engine.connect() as conn:
        return conn.execute(text(sql), params).scalar_one()


def test_migration_upgrade_downgrade_keeps_existing_rows() -> None:
    config = Config("alembic.ini")
    ids = _seed()
    try:
        assert TABLES <= _tables()
        command.downgrade(config, "0005")
        assert TABLES.isdisjoint(_tables())
        # Project rows are gone; everything else stays.
        assert _count("SELECT count(*) FROM notes WHERE entity_type = 'project'") == 0
        assert _count("SELECT count(*) FROM reminders WHERE related_type = 'project'") == 0
        assert _count("SELECT count(*) FROM activity_logs WHERE entity_type = 'project'") == 0
        assert _count("SELECT count(*) FROM notes WHERE id = :i", i=ids["keep_note"]) == 1
        assert _count("SELECT count(*) FROM reminders WHERE id = :i", i=ids["keep_rem"]) == 1
        assert _count("SELECT count(*) FROM activity_logs WHERE entity_type = 'job'") == 1
        assert _count("SELECT count(*) FROM job_applications WHERE id = :i", i=ids["job"]) == 1
        # The old CHECKs are back: `project` is refused again.
        with pytest.raises(IntegrityError), engine.begin() as conn:
            conn.execute(
                text("UPDATE notes SET entity_type = 'project' WHERE id = :i"),
                {"i": ids["keep_note"]},
            )
        with pytest.raises(IntegrityError), engine.begin() as conn:
            conn.execute(
                text("UPDATE reminders SET related_type = 'project' WHERE id = :i"),
                {"i": ids["keep_rem"]},
            )
    finally:
        command.upgrade(config, "head")
    assert TABLES <= _tables()
    assert _count("SELECT count(*) FROM notes WHERE id = :i", i=ids["keep_note"]) == 1
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE notes SET entity_type = 'project' WHERE id = :i"), {"i": ids["keep_note"]}
        )
        conn.execute(
            text("UPDATE reminders SET related_type = 'project' WHERE id = :i"),
            {"i": ids["keep_rem"]},
        )
        with pytest.raises(IntegrityError), conn.begin_nested():
            conn.execute(
                text("UPDATE notes SET entity_type = 'nonsense' WHERE id = :i"),
                {"i": ids["keep_note"]},
            )


def test_migration_0007_adds_and_drops_abstract_submitted_on() -> None:
    config = Config("alembic.ini")

    def columns() -> set[str]:
        return {c["name"] for c in inspect(engine).get_columns("project_submissions")}

    user, project, sub = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    try:
        assert "abstract_submitted_on" in columns()
        command.downgrade(config, "0006")
        assert "abstract_submitted_on" not in columns()
        # A row written under 0006 survives the upgrade, with the new column empty.
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO users (id, full_name, email, password_hash) "
                    "VALUES (:u, 'M', :e, 'x')"
                ),
                {"u": user, "e": f"m-{user}@example.com"},
            )
            conn.execute(
                text("INSERT INTO research_projects (id, user_id, title) VALUES (:p, :u, 'Study')"),
                {"p": project, "u": user},
            )
            conn.execute(
                text(
                    "INSERT INTO project_submissions (id, user_id, project_id, venue_name, "
                    "abstract_deadline) VALUES (:s, :u, :p, 'Venue', '2031-01-01')"
                ),
                {"s": sub, "u": user, "p": project},
            )
        command.upgrade(config, "0007")
        assert "abstract_submitted_on" in columns()
        assert (
            _count(
                "SELECT count(*) FROM project_submissions "
                "WHERE id = :s AND abstract_submitted_on IS NULL "
                "AND abstract_deadline = '2031-01-01'",
                s=sub,
            )
            == 1
        )
    finally:
        command.upgrade(config, "head")
    assert "abstract_submitted_on" in columns()
