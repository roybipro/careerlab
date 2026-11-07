"""add project_submissions.abstract_submitted_on

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-07 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "project_submissions", sa.Column("abstract_submitted_on", sa.Date(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("project_submissions", "abstract_submitted_on")
