"""add nudge_snoozes and the users.email_digest opt-in

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-28 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_digest", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("users", sa.Column("last_digest_on", sa.Date(), nullable=True))
    op.create_table(
        "nudge_snoozes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("until", sa.Date(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "entity_type", "entity_id", name="uq_nudge_snoozes_entity"),
        sa.CheckConstraint(
            "entity_type IN ('job', 'research', 'contact')", name="ck_nudge_snoozes_entity_type"
        ),
    )


def downgrade() -> None:
    op.drop_table("nudge_snoozes")
    op.drop_column("users", "last_digest_on")
    op.drop_column("users", "email_digest")
