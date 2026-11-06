"""create job applications and activity logs

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-06 14:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JOB_TYPES = ("on_site", "remote", "hybrid")
EMPLOYMENT_TYPES = ("full_time", "part_time", "internship", "contract", "temporary")
STATUSES = (
    "wishlist",
    "preparing",
    "applied",
    "assessment",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
)
PRIORITIES = ("low", "medium", "high")


def _in(column: str, values: Sequence[str]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    op.create_table(
        "job_applications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("company_name", sa.String(length=200), nullable=False),
        sa.Column("position_title", sa.String(length=200), nullable=False),
        sa.Column("company_website", sa.String(length=2048)),
        sa.Column("company_logo_url", sa.String(length=2048)),
        sa.Column("job_url", sa.String(length=2048)),
        sa.Column("job_description", sa.Text()),
        sa.Column("location", sa.String(length=200)),
        sa.Column("notes", sa.Text()),
        sa.Column("job_type", sa.String(length=20)),
        sa.Column("employment_type", sa.String(length=20)),
        sa.Column("salary_min", sa.Integer()),
        sa.Column("salary_max", sa.Integer()),
        sa.Column("salary_currency", sa.String(length=10)),
        sa.Column("status", sa.String(length=20), server_default="wishlist", nullable=False),
        sa.Column("priority", sa.String(length=20), server_default="medium", nullable=False),
        sa.Column("resume_version", sa.String(length=500)),
        sa.Column("cover_letter_ref", sa.Text()),
        sa.Column("application_date", sa.Date()),
        sa.Column("deadline", sa.Date()),
        sa.Column("follow_up_date", sa.Date()),
        sa.Column("interview_at", sa.DateTime(timezone=True)),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max",
            name="ck_job_applications_salary_range",
        ),
        sa.CheckConstraint(_in("job_type", JOB_TYPES), name="ck_job_applications_job_type"),
        sa.CheckConstraint(
            _in("employment_type", EMPLOYMENT_TYPES), name="ck_job_applications_employment_type"
        ),
        sa.CheckConstraint(_in("status", STATUSES), name="ck_job_applications_status"),
        sa.CheckConstraint(_in("priority", PRIORITIES), name="ck_job_applications_priority"),
    )
    op.create_index("ix_job_applications_user_status", "job_applications", ["user_id", "status"])
    op.create_index(
        "ix_job_applications_user_deadline", "job_applications", ["user_id", "deadline"]
    )
    op.create_index(
        "ix_job_applications_user_created", "job_applications", ["user_id", "created_at"]
    )

    op.create_table(
        "activity_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_activity_logs_user_entity", "activity_logs", ["user_id", "entity_type", "entity_id"]
    )
    op.create_index("ix_activity_logs_user_created", "activity_logs", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_table("activity_logs")
    op.drop_table("job_applications")
