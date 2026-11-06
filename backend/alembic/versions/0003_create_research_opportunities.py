"""create research opportunities

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-06 15:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OPPORTUNITY_TYPES = (
    "research_assistant",
    "research_internship",
    "graduate_research_program",
    "fully_funded_phd",
    "masters_scholarship",
    "fellowship",
    "research_collaboration",
    "visiting_researcher",
)
FUNDING_STATUSES = ("fully_funded", "partially_funded", "self_funded", "unknown")
STATUSES = (
    "discovered",
    "interested",
    "contacted_professor",
    "preparing_documents",
    "applied",
    "interview",
    "accepted",
    "rejected",
    "archived",
)


def _in(column: str, values: Sequence[str]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    op.create_table(
        "research_opportunities",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("organization", sa.String(length=200), nullable=False),
        sa.Column("opportunity_type", sa.String(length=30)),
        sa.Column("country", sa.String(length=100)),
        sa.Column("department", sa.String(length=200)),
        sa.Column("laboratory", sa.String(length=200)),
        sa.Column("research_area", sa.String(length=200)),
        sa.Column("professor_name", sa.String(length=200)),
        sa.Column("professor_email", sa.String(length=320)),
        sa.Column("professor_website", sa.String(length=2048)),
        sa.Column("description", sa.Text()),
        sa.Column("eligibility", sa.Text()),
        sa.Column("language_test_requirements", sa.Text()),
        sa.Column("notes", sa.Text()),
        sa.Column("website", sa.String(length=2048)),
        sa.Column("application_url", sa.String(length=2048)),
        sa.Column("funding_status", sa.String(length=20), server_default="unknown", nullable=False),
        sa.Column("funding_amount", sa.String(length=200)),
        sa.Column("research_interests", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column("publication_links", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column("required_documents", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column("status", sa.String(length=30), server_default="discovered", nullable=False),
        sa.Column("application_date", sa.Date()),
        sa.Column("deadline", sa.Date()),
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
            _in("opportunity_type", OPPORTUNITY_TYPES),
            name="ck_research_opportunities_opportunity_type",
        ),
        sa.CheckConstraint(
            _in("funding_status", FUNDING_STATUSES), name="ck_research_opportunities_funding_status"
        ),
        sa.CheckConstraint(_in("status", STATUSES), name="ck_research_opportunities_status"),
    )
    op.create_index(
        "ix_research_opportunities_user_status", "research_opportunities", ["user_id", "status"]
    )
    op.create_index(
        "ix_research_opportunities_user_deadline",
        "research_opportunities",
        ["user_id", "deadline"],
    )
    op.create_index(
        "ix_research_opportunities_user_created",
        "research_opportunities",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_table("research_opportunities")
