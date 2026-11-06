"""Create one demo account filled with invented data.

Everything goes through the service layer, so activity logs, status changes and
reminder completions are written the way the app writes them. Dates are relative to
today, so the dashboard has upcoming deadlines, an overdue reminder and a month-by-month
chart whenever the script runs.

Every company, university, person and address below is made up. Addresses use the
reserved `example.com` / `.example` names, which never belong to a real mailbox or site.

Usage, from `backend/` on your machine:

    DEMO_PASSWORD='choose-a-password' python scripts/seed_demo.py

Or inside the running Compose stack:

    docker compose exec -e DEMO_PASSWORD='choose-a-password' api python scripts/seed_demo.py

The password comes from DEMO_PASSWORD only. There is no default and nothing is stored in
the repo. It must be 10 to 128 characters, like any other account.

The script refuses to run unless DATABASE_URL points at localhost or the Compose database
host (`db`), so it cannot fill a real database by accident. Pass --allow-remote to override.
It exits without changes if the demo account already exists.
"""

import argparse
import os
import sys
import uuid
from collections.abc import Mapping, Sequence
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

# `python scripts/seed_demo.py` puts scripts/ on sys.path, not the backend root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.db import get_engine  # noqa: E402
from app.modules.auth import service as auth_service  # noqa: E402
from app.modules.auth.models import User  # noqa: E402
from app.modules.contacts import service as contacts_service  # noqa: E402
from app.modules.contacts.models import ContactType  # noqa: E402
from app.modules.contacts.schemas import ContactCreate, ContactLinkIn  # noqa: E402
from app.modules.entity_types import EntityType, LinkableType  # noqa: E402
from app.modules.jobs import service as jobs_service  # noqa: E402
from app.modules.jobs.models import (  # noqa: E402
    EmploymentType,
    JobSource,
    JobStatus,
    JobType,
    PayPeriod,
    Priority,
    VisaSponsorship,
)
from app.modules.jobs.schemas import JobCreate, JobUpdate  # noqa: E402
from app.modules.notes import service as notes_service  # noqa: E402
from app.modules.notes.models import NoteKind  # noqa: E402
from app.modules.notes.schemas import NoteCreate  # noqa: E402
from app.modules.reminders import service as reminders_service  # noqa: E402
from app.modules.reminders.schemas import ReminderCreate, ReminderUpdate  # noqa: E402
from app.modules.research import service as research_service  # noqa: E402
from app.modules.research.models import (  # noqa: E402
    FundingStatus,
    OpportunityType,
    ResearchStatus,
)
from app.modules.research.schemas import (  # noqa: E402
    PublicationLink,
    RequiredDocument,
    ResearchCreate,
    ResearchUpdate,
)

DEMO_EMAIL = "demo@example.com"
DEMO_NAME = "Alex Demo"
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", "db"})
PASSWORD_ENV = "DEMO_PASSWORD"
MIN_PASSWORD = 10
MAX_PASSWORD = 128


class SeedError(Exception):
    """A reason to stop before touching the database. The message is safe to print."""


def check_target(database_url: str, allow_remote: bool) -> None:
    """Refuse a database that is not local, unless the caller said --allow-remote.

    Only the host is ever reported, never the credentials in the URL.
    """
    host = make_url(database_url).host or ""
    if host in LOCAL_HOSTS or allow_remote:
        return
    raise SeedError(
        f"Refusing to seed database host '{host}'. The seed only runs against localhost or the "
        "Compose host 'db'. Pass --allow-remote if you really mean to fill this database."
    )


def read_password(environ: Mapping[str, str]) -> str:
    password = environ.get(PASSWORD_ENV, "")
    if not password:
        raise SeedError(
            f"{PASSWORD_ENV} is not set. Choose a password and pass it in the environment, for "
            f"example: {PASSWORD_ENV}='choose-a-password' python scripts/seed_demo.py"
        )
    if not MIN_PASSWORD <= len(password) <= MAX_PASSWORD:
        raise SeedError(f"{PASSWORD_ENV} must be {MIN_PASSWORD} to {MAX_PASSWORD} characters long.")
    return password


def _at(day: date, hour: int) -> datetime:
    return datetime.combine(day, time(hour=hour), tzinfo=UTC)


def seed(db: Session, password: str, today: date) -> User:
    def d(days: int) -> date:
        return today + timedelta(days=days)

    user = auth_service.register(db, DEMO_NAME, DEMO_EMAIL, password)

    # --- Jobs -------------------------------------------------------------------------
    # Each job is created in its first status and then moved, so the timeline shows
    # real status_changed events. Application dates reach back across the last year.

    def job(create: JobCreate, moves: Sequence[JobStatus] = ()) -> uuid.UUID:
        created = jobs_service.create_job(db, user, create)
        for status in moves:
            jobs_service.update_job(db, user, created.id, JobUpdate(status=status))
        return created.id

    fernwood = job(
        JobCreate(
            company_name="Fernwood Analytics",
            position_title="Junior Data Analyst",
            company_website="https://fernwood-analytics.example",
            job_url="https://fernwood-analytics.example/careers/junior-data-analyst",
            job_description="Build weekly reports and dashboards for retail clients. SQL and "
            "Python required.",
            location="Lisbon, Portugal",
            job_type=JobType.hybrid,
            employment_type=EmploymentType.full_time,
            salary_min=32000,
            salary_max=38000,
            salary_currency="EUR",
            pay_period=PayPeriod.yearly,
            source=JobSource.company_website,
            visa_sponsorship=VisaSponsorship.yes,
            priority=Priority.high,
            resume_version="Data analyst v3",
            application_date=d(-9),
            follow_up_date=d(3),
            interview_at=_at(d(2), 14),
        ),
        [JobStatus.preparing, JobStatus.applied, JobStatus.assessment, JobStatus.interview],
    )
    quillstone = job(
        JobCreate(
            company_name="Quillstone Systems",
            position_title="Backend Engineer Intern",
            company_website="https://quillstone-systems.example",
            job_url="https://quillstone-systems.example/jobs/backend-intern",
            location="Remote (Europe)",
            job_type=JobType.remote,
            employment_type=EmploymentType.internship,
            salary_min=1800,
            salary_max=2200,
            salary_currency="EUR",
            pay_period=PayPeriod.monthly,
            source=JobSource.university_career_center,
            start_date=d(120),
            end_date=d(210),
            visa_sponsorship=VisaSponsorship.no,
            academic_credit=True,
            priority=Priority.high,
            resume_version="Software v5",
            application_date=d(-20),
            follow_up_date=d(5),
            interview_at=_at(d(6), 10),
        ),
        [JobStatus.preparing, JobStatus.applied, JobStatus.assessment, JobStatus.interview],
    )
    tidewater = job(
        JobCreate(
            company_name="Tidewater Labs",
            position_title="Machine Learning Engineer",
            company_website="https://tidewater-labs.example",
            location="Berlin, Germany",
            job_type=JobType.hybrid,
            employment_type=EmploymentType.full_time,
            salary_min=58000,
            salary_max=70000,
            salary_currency="EUR",
            priority=Priority.medium,
            application_date=d(-34),
            deadline=d(-30),
        ),
        [
            JobStatus.preparing,
            JobStatus.applied,
            JobStatus.assessment,
            JobStatus.interview,
            JobStatus.offer,
        ],
    )
    job(
        JobCreate(
            company_name="Brightmoor Studio",
            position_title="Frontend Developer",
            company_website="https://brightmoor-studio.example",
            location="Remote",
            job_type=JobType.remote,
            employment_type=EmploymentType.freelance,
            pay_period=PayPeriod.hourly,
            salary_min=40,
            salary_max=55,
            salary_currency="EUR",
            source=JobSource.referral,
            priority=Priority.medium,
            application_date=d(-52),
        ),
        [JobStatus.preparing, JobStatus.applied, JobStatus.rejected],
    )
    job(
        JobCreate(
            company_name="Halcyon Pine Software",
            position_title="QA Automation Engineer",
            location="Dublin, Ireland",
            job_type=JobType.on_site,
            employment_type=EmploymentType.full_time,
            priority=Priority.low,
            application_date=d(-75),
        ),
        [JobStatus.preparing, JobStatus.applied, JobStatus.withdrawn],
    )
    marlowe = job(
        JobCreate(
            company_name="Marlowe & Finch Data",
            position_title="Analytics Engineer",
            company_website="https://marlowe-finch-data.example",
            location="Amsterdam, Netherlands",
            job_type=JobType.hybrid,
            employment_type=EmploymentType.full_time,
            salary_min=52000,
            salary_max=62000,
            salary_currency="EUR",
            pay_period=PayPeriod.yearly,
            source=JobSource.linkedin,
            priority=Priority.high,
            deadline=d(4),
            application_date=d(-2),
            follow_up_date=d(6),
        ),
        [JobStatus.preparing, JobStatus.applied],
    )
    job(
        JobCreate(
            company_name="Copperleaf Robotics",
            position_title="Software Engineer, Perception",
            location="Zurich, Switzerland",
            job_type=JobType.on_site,
            employment_type=EmploymentType.full_time,
            priority=Priority.medium,
            deadline=d(11),
            application_date=d(-130),
        ),
        [JobStatus.preparing],
    )
    job(
        JobCreate(
            company_name="Lanternfish Health",
            position_title="Data Engineer",
            location="Remote (EU)",
            job_type=JobType.remote,
            employment_type=EmploymentType.full_time,
            priority=Priority.low,
            deadline=d(28),
            application_date=d(-170),
        ),
    )
    job(
        JobCreate(
            company_name="Osprey Mapworks",
            position_title="GIS Developer",
            location="Edinburgh, United Kingdom",
            job_type=JobType.hybrid,
            employment_type=EmploymentType.part_time,
            priority=Priority.low,
            application_date=d(-215),
        ),
        [JobStatus.preparing, JobStatus.applied, JobStatus.rejected],
    )

    job(
        JobCreate(
            company_name="Harbourlight Engineering",
            position_title="Software Co-op Student",
            company_website="https://harbourlight-engineering.example",
            location="Toronto, Canada",
            job_type=JobType.hybrid,
            employment_type=EmploymentType.co_op,
            salary_min=24,
            salary_max=28,
            salary_currency="CAD",
            pay_period=PayPeriod.hourly,
            source=JobSource.university_career_center,
            start_date=d(150),
            end_date=d(270),
            visa_sponsorship=VisaSponsorship.unknown,
            academic_credit=True,
            priority=Priority.medium,
            deadline=d(15),
        ),
        [JobStatus.preparing],
    )
    job(
        JobCreate(
            company_name="Mossbank Community Trust",
            position_title="Digital Skills Volunteer Intern",
            location="Cork, Ireland",
            job_type=JobType.on_site,
            employment_type=EmploymentType.internship,
            pay_period=PayPeriod.unpaid,
            source=JobSource.job_board,
            start_date=d(60),
            end_date=d(102),
            academic_credit=False,
            priority=Priority.low,
        ),
    )
    job(
        JobCreate(
            company_name="Alderwick Group",
            position_title="Graduate Software Programme",
            location="London, United Kingdom",
            job_type=JobType.hybrid,
            employment_type=EmploymentType.graduate_program,
            salary_min=34000,
            salary_max=34000,
            salary_currency="GBP",
            pay_period=PayPeriod.yearly,
            source=JobSource.recruiter,
            start_date=d(240),
            visa_sponsorship=VisaSponsorship.yes,
            priority=Priority.medium,
            deadline=d(20),
        ),
    )

    # --- Research opportunities -------------------------------------------------------

    def research(create: ResearchCreate, moves: Sequence[ResearchStatus] = ()) -> uuid.UUID:
        created = research_service.create_research(db, user, create)
        for status in moves:
            research_service.update_research(db, user, created.id, ResearchUpdate(status=status))
        return created.id

    ml_program_id = research(
        ResearchCreate(
            title="Graduate Research Program in Machine Learning",
            organization="Ashgrove Institute of Technology",
            opportunity_type=OpportunityType.graduate_research_program,
            country="Germany",
            department="Department of Computer Science",
            laboratory="Applied Learning Lab",
            research_area="Machine learning for scientific data",
            professor_name="Prof. Imogen Valdry",
            professor_email="i.valdry@ashgrove-tech.example",
            professor_website="https://ashgrove-tech.example/people/valdry",
            description="Two-year research program with a funded thesis project. Students "
            "join one lab and present at a yearly symposium.",
            eligibility="Bachelor's degree in computer science, mathematics or a related "
            "field with strong grades.",
            language_test_requirements="IELTS 6.5 overall, or a recognised equivalent. No GRE.",
            notes="Prof. Valdry replied within a week last time. Ask about the thesis topic.",
            website="https://ashgrove-tech.example/graduate-program",
            application_url="https://ashgrove-tech.example/apply",
            funding_status=FundingStatus.fully_funded,
            funding_amount="EUR 1,900/month stipend plus tuition waiver",
            research_interests=["Machine learning", "Scientific data", "Time series"],
            publication_links=[
                PublicationLink(
                    title="Learning from sparse sensor data",
                    url="https://ashgrove-tech.example/papers/sparse-sensors",
                ),
                PublicationLink(
                    title="Benchmarks for time series models",
                    url="https://ashgrove-tech.example/papers/time-series-benchmarks",
                ),
            ],
            required_documents=[
                RequiredDocument(name="CV", done=True),
                RequiredDocument(name="Statement of purpose", done=True),
                RequiredDocument(name="Transcripts", done=False),
                RequiredDocument(name="Two reference letters", done=False),
                RequiredDocument(name="IELTS score report", done=False),
            ],
            application_date=None,
            deadline=d(9),
        ),
        [
            ResearchStatus.interested,
            ResearchStatus.contacted_professor,
            ResearchStatus.preparing_documents,
        ],
    )
    westmarch_id = research(
        ResearchCreate(
            title="Research Internship in Computational Biology",
            organization="University of Westmarch",
            opportunity_type=OpportunityType.research_internship,
            country="Canada",
            department="Faculty of Life Sciences",
            laboratory="Genome Systems Group",
            research_area="Computational biology",
            professor_name="Dr. Tobias Wennick",
            professor_email="t.wennick@westmarch.example",
            funding_status=FundingStatus.partially_funded,
            funding_amount="CAD 2,500 for a 12-week stay",
            research_interests=["Genomics", "Bioinformatics"],
            required_documents=[
                RequiredDocument(name="CV", done=True),
                RequiredDocument(name="Motivation letter", done=True),
            ],
            application_date=d(-14),
            deadline=d(-7),
        ),
        [
            ResearchStatus.interested,
            ResearchStatus.preparing_documents,
            ResearchStatus.applied,
            ResearchStatus.interview,
        ],
    )
    research(
        ResearchCreate(
            title="Fully Funded PhD in Robotics and Perception",
            organization="Veldmark Institute of Science",
            opportunity_type=OpportunityType.fully_funded_phd,
            country="Sweden",
            research_area="Robot perception",
            professor_name="Dr. Priya Anselm",
            professor_email="p.anselm@veldmark.example",
            funding_status=FundingStatus.fully_funded,
            funding_amount="SEK 33,000/month",
            research_interests=["Robotics", "Computer vision"],
            required_documents=[
                RequiredDocument(name="CV", done=True),
                RequiredDocument(name="Research proposal", done=False),
                RequiredDocument(name="Two reference letters", done=False),
            ],
            deadline=d(13),
        ),
        [ResearchStatus.interested, ResearchStatus.contacted_professor],
    )
    research(
        ResearchCreate(
            title="Masters Scholarship in Data Science",
            organization="Eastvale Technical University",
            opportunity_type=OpportunityType.masters_scholarship,
            country="Netherlands",
            funding_status=FundingStatus.partially_funded,
            funding_amount="EUR 8,000 per year",
            research_interests=["Data science"],
            required_documents=[RequiredDocument(name="Transcripts", done=False)],
            deadline=d(24),
        ),
        [ResearchStatus.interested],
    )
    research(
        ResearchCreate(
            title="Visiting Researcher Fellowship",
            organization="Norwick Centre for Open Science",
            opportunity_type=OpportunityType.fellowship,
            country="United Kingdom",
            research_area="Open research tools",
            funding_status=FundingStatus.unknown,
            research_interests=["Open science", "Research software"],
        ),
    )
    research(
        ResearchCreate(
            title="Research Assistant, Climate Modelling",
            organization="Stonebridge Climate Institute",
            opportunity_type=OpportunityType.research_assistant,
            country="Norway",
            funding_status=FundingStatus.self_funded,
            research_interests=["Climate modelling"],
            application_date=d(-100),
        ),
        [
            ResearchStatus.interested,
            ResearchStatus.preparing_documents,
            ResearchStatus.applied,
            ResearchStatus.accepted,
        ],
    )
    research(
        ResearchCreate(
            title="Summer School in Applied Statistics",
            organization="Redfern College of Mathematics",
            opportunity_type=OpportunityType.research_collaboration,
            country="Ireland",
            funding_status=FundingStatus.self_funded,
            application_date=d(-160),
        ),
        [ResearchStatus.interested, ResearchStatus.applied, ResearchStatus.rejected],
    )

    # --- Contacts and links -----------------------------------------------------------

    def contact(create: ContactCreate) -> uuid.UUID:
        return contacts_service.create_contact(db, user, create).id

    valdry = contact(
        ContactCreate(
            name="Prof. Imogen Valdry",
            email="i.valdry@ashgrove-tech.example",
            organization="Ashgrove Institute of Technology",
            position="Professor of Computer Science",
            contact_type=ContactType.professor,
            website="https://ashgrove-tech.example/people/valdry",
            last_contacted_at=d(-6),
            next_follow_up_at=d(2),
            notes="Prefers short emails with a one-paragraph summary of interests.",
        )
    )
    wennick = contact(
        ContactCreate(
            name="Dr. Tobias Wennick",
            email="t.wennick@westmarch.example",
            organization="University of Westmarch",
            position="Associate Professor",
            contact_type=ContactType.professor,
            last_contacted_at=d(-12),
        )
    )
    anselm = contact(
        ContactCreate(
            name="Dr. Priya Anselm",
            email="p.anselm@veldmark.example",
            organization="Veldmark Institute of Science",
            position="Senior Researcher",
            contact_type=ContactType.researcher,
            last_contacted_at=d(-3),
            next_follow_up_at=d(6),
        )
    )
    recruiter = contact(
        ContactCreate(
            name="Mara Okonkwo-Reyes",
            email="mara@fernwood-analytics.example",
            organization="Fernwood Analytics",
            position="Technical Recruiter",
            contact_type=ContactType.recruiter,
            last_contacted_at=d(-4),
            next_follow_up_at=d(1),
        )
    )
    manager = contact(
        ContactCreate(
            name="Jonas Ekwall",
            email="jonas@quillstone-systems.example",
            organization="Quillstone Systems",
            position="Engineering Manager",
            contact_type=ContactType.hiring_manager,
            last_contacted_at=d(-8),
        )
    )
    contact(
        ContactCreate(
            name="Hannah Brightwater",
            organization="Eastvale Technical University",
            position="Admissions Officer",
            contact_type=ContactType.university_representative,
            next_follow_up_at=d(10),
        )
    )

    def link(contact_id: uuid.UUID, entity_type: LinkableType, entity_id: uuid.UUID) -> None:
        contacts_service.add_link(
            db, user, contact_id, ContactLinkIn(entity_type=entity_type, entity_id=entity_id)
        )

    link(valdry, LinkableType.research, ml_program_id)
    link(wennick, LinkableType.research, westmarch_id)
    link(recruiter, LinkableType.job, fernwood)
    link(manager, LinkableType.job, quillstone)

    # --- Notes ------------------------------------------------------------------------

    def note(kind: NoteKind, entity_type: EntityType, entity_id: uuid.UUID, content: str) -> None:
        notes_service.create_note(
            db,
            user,
            NoteCreate(entity_type=entity_type, entity_id=entity_id, kind=kind, content=content),
        )

    fernwood_id = fernwood
    quillstone_id = quillstone
    note(
        NoteKind.communication,
        EntityType.job,
        fernwood_id,
        "Mara confirmed a 45-minute video interview with two analysts. Bring one example "
        "dashboard to talk through.",
    )
    note(
        NoteKind.note,
        EntityType.job,
        fernwood_id,
        "Take-home SQL task took about 2 hours. Submitted with a short write-up.",
    )
    note(
        NoteKind.interview_feedback,
        EntityType.job,
        quillstone_id,
        "First round went well. They asked about API design and how I test database code. "
        "Next round is a pairing session.",
    )
    note(
        NoteKind.note,
        EntityType.job,
        tidewater,
        "Offer arrived by email. Reply needed within two weeks. Compare with the research "
        "options before deciding.",
    )
    note(
        NoteKind.note,
        EntityType.job,
        marlowe,
        "Applied through their careers page. The role mentions dbt, so refresh that.",
    )
    note(
        NoteKind.communication,
        EntityType.research,
        ml_program_id,
        "Emailed Prof. Valdry a short summary of my interests. She suggested two papers to "
        "read before applying.",
    )
    note(
        NoteKind.note,
        EntityType.research,
        ml_program_id,
        "Statement of purpose draft is done. Transcripts take about a week to arrive, so "
        "order them soon.",
    )
    note(
        NoteKind.interview_feedback,
        EntityType.research,
        westmarch_id,
        "Video call with Dr. Wennick went well. Waiting to hear about the internship panel.",
    )
    note(
        NoteKind.communication,
        EntityType.contact,
        valdry,
        "Follow up after reading the papers she recommended.",
    )

    # --- Reminders --------------------------------------------------------------------

    def reminder(
        title: str,
        due: datetime,
        related: tuple[EntityType, uuid.UUID] | None = None,
        description: str | None = None,
    ) -> uuid.UUID:
        return reminders_service.create_reminder(
            db,
            user,
            ReminderCreate(
                title=title,
                description=description,
                due_at=due,
                related_type=related[0] if related else None,
                related_id=related[1] if related else None,
            ),
        ).id

    reminder(
        "Send thank-you note to Fernwood interviewers", _at(d(-1), 9), (EntityType.job, fernwood_id)
    )
    reminder(
        "Prepare examples for Fernwood interview",
        _at(d(1), 17),
        (EntityType.job, fernwood_id),
        "Pick one dashboard and one SQL example.",
    )
    reminder(
        "Order transcripts for Ashgrove application",
        _at(d(2), 12),
        (EntityType.research, ml_program_id),
    )
    reminder("Follow up with Dr. Anselm", _at(d(5), 10), (EntityType.contact, anselm))
    reminder("Review Marlowe & Finch job posting again", _at(d(3), 18), (EntityType.job, marlowe))
    reminder("Reply to Tidewater Labs offer", _at(d(10), 12), (EntityType.job, tidewater))
    done = reminder(
        "Finish Ashgrove statement of purpose", _at(d(-3), 20), (EntityType.research, ml_program_id)
    )
    reminders_service.update_reminder(db, user, done, ReminderUpdate(is_completed=True))

    spread_activity(db, user, today)
    return user


def spread_activity(db: Session, user: User, today: date) -> None:
    """Space the activity events over the last three weeks instead of one second.

    The services stamp every event with the moment it ran, so the whole history would show
    as "just now". This keeps the order and spaces the events out, newest last.
    """
    db.execute(
        text(
            """
            UPDATE activity_logs AS a
            SET created_at = :end - (:span * (t.total - t.rn)::double precision / t.total)
            FROM (
                SELECT id,
                       row_number() OVER (ORDER BY created_at, id) AS rn,
                       count(*) OVER () AS total
                FROM activity_logs WHERE user_id = :user_id
            ) AS t
            WHERE a.id = t.id
            """
        ),
        {
            "end": datetime.now(UTC) - timedelta(minutes=30),
            "span": timedelta(days=21),
            "user_id": user.id,
        },
    )
    db.commit()


def main(argv: Sequence[str] | None = None, environ: Mapping[str, str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create a demo account with invented data.")
    parser.add_argument(
        "--allow-remote",
        action="store_true",
        help="Run even though DATABASE_URL is not localhost or the Compose host 'db'.",
    )
    args = parser.parse_args(argv)
    environ = os.environ if environ is None else environ

    try:
        password = read_password(environ)
        try:
            database_url = get_settings().DATABASE_URL
        except ValidationError as error:
            fields = ", ".join(str(e["loc"][0]) for e in error.errors())
            raise SeedError(
                f"The backend settings are invalid ({fields}). Copy .env.example to .env at the "
                "repo root and fill in JWT_SECRET, or run this inside the api container."
            ) from None
        check_target(database_url, args.allow_remote)
        with Session(get_engine(), expire_on_commit=False) as db:
            if auth_service.get_user_by_email(db, DEMO_EMAIL) is not None:
                raise SeedError(
                    f"The demo account {DEMO_EMAIL} already exists. Nothing was changed. "
                    "Delete that user first if you want a fresh copy."
                )
            seed(db, password, datetime.now(UTC).date())
    except SeedError as error:
        print(f"seed_demo: {error}", file=sys.stderr)
        return 1

    print(f"Created demo account {DEMO_EMAIL} with sample jobs, research, contacts and reminders.")
    print(f"Sign in with the password you set in {PASSWORD_ENV}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
