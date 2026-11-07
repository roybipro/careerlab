"""add research projects, submissions and milestones; allow `project` on notes and reminders

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-06 20:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_ENTITY_TYPES = ("job", "research", "contact")
NEW_ENTITY_TYPES = ("job", "research", "project", "contact")
PROJECT_TYPES = ("personal", "university_course", "thesis", "research_group", "other")
STAGES = (
    "idea",
    "literature_review",
    "experiments",
    "writing",
    "submitting",
    "published",
    "paused",
)
VENUE_TYPES = ("conference", "journal", "workshop", "other")
SUBMISSION_STATUSES = (
    "planned",
    "submitted",
    "under_review",
    "revisions_requested",
    "accepted",
    "rejected",
    "withdrawn",
)


def _in(column: str, values: Sequence[str]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    ]


def _widen_entity_checks(values: Sequence[str]) -> None:
    """Replace the entity type CHECKs on notes and reminders. Activity logs have none."""
    op.drop_constraint("ck_notes_entity_type", "notes", type_="check")
    op.create_check_constraint("ck_notes_entity_type", "notes", _in("entity_type", values))
    op.drop_constraint("ck_reminders_related_type", "reminders", type_="check")
    op.create_check_constraint(
        "ck_reminders_related_type", "reminders", _in("related_type", values)
    )


def upgrade() -> None:
    op.create_table(
        "research_projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("project_type", sa.String(length=30), server_default="personal", nullable=False),
        sa.Column("stage", sa.String(length=30), server_default="idea", nullable=False),
        sa.Column("topic", sa.String(length=200)),
        sa.Column("description", sa.Text()),
        sa.Column("institution", sa.String(length=200)),
        sa.Column("notes", sa.Text()),
        sa.Column("target_date", sa.Date()),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            _in("project_type", PROJECT_TYPES), name="ck_research_projects_project_type"
        ),
        sa.CheckConstraint(_in("stage", STAGES), name="ck_research_projects_stage"),
    )
    op.create_index("ix_research_projects_user_stage", "research_projects", ["user_id", "stage"])
    op.create_index(
        "ix_research_projects_user_created", "research_projects", ["user_id", "created_at"]
    )
    op.create_index(
        "ix_research_projects_user_target_date", "research_projects", ["user_id", "target_date"]
    )

    op.create_table(
        "project_submissions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("venue_name", sa.String(length=200), nullable=False),
        sa.Column("venue_type", sa.String(length=20), server_default="conference", nullable=False),
        sa.Column("venue_url", sa.String(length=2048)),
        sa.Column("abstract_deadline", sa.Date()),
        sa.Column("paper_deadline", sa.Date()),
        sa.Column("notification_date", sa.Date()),
        sa.Column("submitted_on", sa.Date()),
        sa.Column("status", sa.String(length=30), server_default="planned", nullable=False),
        sa.Column("feedback", sa.Text()),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            _in("venue_type", VENUE_TYPES), name="ck_project_submissions_venue_type"
        ),
        sa.CheckConstraint(
            _in("status", SUBMISSION_STATUSES), name="ck_project_submissions_status"
        ),
        sa.CheckConstraint(
            "abstract_deadline IS NULL OR paper_deadline IS NULL "
            "OR abstract_deadline <= paper_deadline",
            name="ck_project_submissions_deadline_order",
        ),
    )
    op.create_index(
        "ix_project_submissions_user_project", "project_submissions", ["user_id", "project_id"]
    )
    op.create_index(
        "ix_project_submissions_user_status_paper",
        "project_submissions",
        ["user_id", "status", "paper_deadline"],
    )
    op.create_index(
        "ix_project_submissions_user_status_abstract",
        "project_submissions",
        ["user_id", "status", "abstract_deadline"],
    )

    op.create_table(
        "project_milestones",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("due_date", sa.Date()),
        sa.Column("is_done", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_project_milestones_user_project", "project_milestones", ["user_id", "project_id"]
    )
    op.create_index(
        "ix_project_milestones_user_done_due",
        "project_milestones",
        ["user_id", "is_done", "due_date"],
    )

    _widen_entity_checks(NEW_ENTITY_TYPES)


def downgrade() -> None:
    # Rows that point at a project cannot satisfy the old CHECKs, and the project rows they
    # point at go with the tables below, so they are removed first.
    op.execute(sa.text("DELETE FROM notes WHERE entity_type = 'project'"))
    op.execute(sa.text("DELETE FROM reminders WHERE related_type = 'project'"))
    op.execute(sa.text("DELETE FROM activity_logs WHERE entity_type = 'project'"))
    _widen_entity_checks(OLD_ENTITY_TYPES)

    op.drop_table("project_milestones")
    op.drop_table("project_submissions")
    op.drop_table("research_projects")
