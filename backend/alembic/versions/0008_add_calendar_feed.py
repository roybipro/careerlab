"""add users.calendar_token_hash for the calendar feed

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-28 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("calendar_token_hash", sa.String(64), nullable=True))
    op.create_unique_constraint("uq_users_calendar_token_hash", "users", ["calendar_token_hash"])


def downgrade() -> None:
    op.drop_constraint("uq_users_calendar_token_hash", "users", type_="unique")
    op.drop_column("users", "calendar_token_hash")
