"""add job options: more employment types, source, dates, pay period, visa, academic credit

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-06 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_EMPLOYMENT_TYPES = ("full_time", "part_time", "internship", "contract", "temporary")
NEW_EMPLOYMENT_TYPES = ("co_op", "apprenticeship", "freelance", "graduate_program")
SOURCES = (
    "linkedin",
    "company_website",
    "referral",
    "job_board",
    "university_career_center",
    "recruiter",
    "other",
)
PAY_PERIODS = ("hourly", "monthly", "yearly", "stipend", "unpaid")
VISA_SPONSORSHIPS = ("yes", "no", "unknown")

TABLE = "job_applications"
EMPLOYMENT_CHECK = "ck_job_applications_employment_type"


def _in(column: str, values: Sequence[str]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    op.drop_constraint(EMPLOYMENT_CHECK, TABLE, type_="check")
    op.create_check_constraint(
        EMPLOYMENT_CHECK, TABLE, _in("employment_type", OLD_EMPLOYMENT_TYPES + NEW_EMPLOYMENT_TYPES)
    )

    op.add_column(TABLE, sa.Column("pay_period", sa.String(length=20)))
    op.add_column(TABLE, sa.Column("source", sa.String(length=30)))
    op.add_column(TABLE, sa.Column("start_date", sa.Date()))
    op.add_column(TABLE, sa.Column("end_date", sa.Date()))
    op.add_column(TABLE, sa.Column("visa_sponsorship", sa.String(length=20)))
    op.add_column(TABLE, sa.Column("academic_credit", sa.Boolean()))

    op.create_check_constraint(
        "ck_job_applications_pay_period", TABLE, _in("pay_period", PAY_PERIODS)
    )
    op.create_check_constraint("ck_job_applications_source", TABLE, _in("source", SOURCES))
    op.create_check_constraint(
        "ck_job_applications_visa_sponsorship",
        TABLE,
        _in("visa_sponsorship", VISA_SPONSORSHIPS),
    )
    op.create_check_constraint(
        "ck_job_applications_date_range",
        TABLE,
        "start_date IS NULL OR end_date IS NULL OR start_date <= end_date",
    )


def downgrade() -> None:
    # Rows using a value the old CHECK does not know become "not set" first, or the
    # constraint below could not be created. The new columns are dropped with their data.
    op.execute(
        sa.text(
            f"UPDATE {TABLE} SET employment_type = NULL "
            f"WHERE {_in('employment_type', NEW_EMPLOYMENT_TYPES)}"
        )
    )
    op.drop_constraint("ck_job_applications_date_range", TABLE, type_="check")
    op.drop_constraint("ck_job_applications_visa_sponsorship", TABLE, type_="check")
    op.drop_constraint("ck_job_applications_source", TABLE, type_="check")
    op.drop_constraint("ck_job_applications_pay_period", TABLE, type_="check")
    for column in (
        "academic_credit",
        "visa_sponsorship",
        "end_date",
        "start_date",
        "source",
        "pay_period",
    ):
        op.drop_column(TABLE, column)

    op.drop_constraint(EMPLOYMENT_CHECK, TABLE, type_="check")
    op.create_check_constraint(
        EMPLOYMENT_CHECK, TABLE, _in("employment_type", OLD_EMPLOYMENT_TYPES)
    )
