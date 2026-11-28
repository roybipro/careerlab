"""add job_interviews: interview rounds of a job application

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-28 15:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TYPES = (
    "phone_screen",
    "video",
    "onsite",
    "technical",
    "behavioral",
    "case_study",
    "take_home",
    "panel",
    "other",
)
OUTCOMES = ("pending", "passed", "not_passed", "cancelled")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    op.create_table(
        "job_interviews",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("interview_type", sa.String(length=20), server_default="other", nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("location", sa.String(length=500), nullable=True),
        sa.Column("interviewers", sa.String(length=500), nullable=True),
        sa.Column("outcome", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("questions", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("thank_you_sent", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["job_id"], ["job_applications.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(_in("interview_type", TYPES), name="ck_job_interviews_type"),
        sa.CheckConstraint(_in("outcome", OUTCOMES), name="ck_job_interviews_outcome"),
        sa.CheckConstraint(
            "rating IS NULL OR rating BETWEEN 1 AND 5", name="ck_job_interviews_rating"
        ),
        sa.CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 1440",
            name="ck_job_interviews_duration",
        ),
    )
    op.create_index("ix_job_interviews_user_job", "job_interviews", ["user_id", "job_id"])
    op.create_index(
        "ix_job_interviews_user_scheduled", "job_interviews", ["user_id", "scheduled_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_job_interviews_user_scheduled", table_name="job_interviews")
    op.drop_index("ix_job_interviews_user_job", table_name="job_interviews")
    op.drop_table("job_interviews")
