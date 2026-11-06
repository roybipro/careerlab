"""create contacts, contact links, notes and reminders

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-06 16:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CONTACT_TYPES = (
    "recruiter",
    "professor",
    "researcher",
    "hiring_manager",
    "university_representative",
    "other",
)
LINKABLE_TYPES = ("job", "research")
ENTITY_TYPES = ("job", "research", "contact")
NOTE_KINDS = ("note", "interview_feedback", "communication")


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


def upgrade() -> None:
    op.create_table(
        "contacts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=320)),
        sa.Column("organization", sa.String(length=200)),
        sa.Column("position", sa.String(length=200)),
        sa.Column("contact_type", sa.String(length=30)),
        sa.Column("linkedin_url", sa.String(length=2048)),
        sa.Column("website", sa.String(length=2048)),
        sa.Column("last_contacted_at", sa.Date()),
        sa.Column("next_follow_up_at", sa.Date()),
        sa.Column("notes", sa.Text()),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(_in("contact_type", CONTACT_TYPES), name="ck_contacts_contact_type"),
    )
    op.create_index("ix_contacts_user_follow_up", "contacts", ["user_id", "next_follow_up_at"])

    op.create_table(
        "contact_links",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("contact_id", sa.Uuid(), nullable=False),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "contact_id", "entity_type", "entity_id", name="uq_contact_links_contact_entity"
        ),
        sa.CheckConstraint(_in("entity_type", LINKABLE_TYPES), name="ck_contact_links_entity_type"),
    )
    op.create_index(
        "ix_contact_links_user_entity", "contact_links", ["user_id", "entity_type", "entity_id"]
    )

    op.create_table(
        "notes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=30), server_default="note", nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(_in("entity_type", ENTITY_TYPES), name="ck_notes_entity_type"),
        sa.CheckConstraint(_in("kind", NOTE_KINDS), name="ck_notes_kind"),
    )
    op.create_index("ix_notes_user_entity", "notes", ["user_id", "entity_type", "entity_id"])

    op.create_table(
        "reminders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("related_type", sa.String(length=20)),
        sa.Column("related_id", sa.Uuid()),
        sa.Column("is_completed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(_in("related_type", ENTITY_TYPES), name="ck_reminders_related_type"),
        sa.CheckConstraint(
            "(related_type IS NULL) = (related_id IS NULL)", name="ck_reminders_related_pair"
        ),
    )
    op.create_index("ix_reminders_user_due", "reminders", ["user_id", "due_at", "is_completed"])


def downgrade() -> None:
    op.drop_table("reminders")
    op.drop_table("notes")
    op.drop_table("contact_links")
    op.drop_table("contacts")
