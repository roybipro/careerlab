import enum
import uuid
from datetime import date
from typing import Any

from sqlalchemy import Date, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, str_enum


class OpportunityType(enum.StrEnum):
    research_assistant = "research_assistant"
    research_internship = "research_internship"
    graduate_research_program = "graduate_research_program"
    fully_funded_phd = "fully_funded_phd"
    masters_scholarship = "masters_scholarship"
    fellowship = "fellowship"
    research_collaboration = "research_collaboration"
    visiting_researcher = "visiting_researcher"


class FundingStatus(enum.StrEnum):
    fully_funded = "fully_funded"
    partially_funded = "partially_funded"
    self_funded = "self_funded"
    unknown = "unknown"


class ResearchStatus(enum.StrEnum):
    discovered = "discovered"
    interested = "interested"
    contacted_professor = "contacted_professor"
    preparing_documents = "preparing_documents"
    applied = "applied"
    interview = "interview"
    accepted = "accepted"
    rejected = "rejected"
    archived = "archived"


class ResearchOpportunity(TimestampMixin, Base):
    __tablename__ = "research_opportunities"
    __table_args__ = (
        Index("ix_research_opportunities_user_status", "user_id", "status"),
        Index("ix_research_opportunities_user_deadline", "user_id", "deadline"),
        Index("ix_research_opportunities_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    organization: Mapped[str] = mapped_column(String(200))
    opportunity_type: Mapped[OpportunityType | None] = mapped_column(str_enum(OpportunityType, 30))
    country: Mapped[str | None] = mapped_column(String(100))
    department: Mapped[str | None] = mapped_column(String(200))
    laboratory: Mapped[str | None] = mapped_column(String(200))
    research_area: Mapped[str | None] = mapped_column(String(200))
    professor_name: Mapped[str | None] = mapped_column(String(200))
    professor_email: Mapped[str | None] = mapped_column(String(320))
    professor_website: Mapped[str | None] = mapped_column(String(2048))
    description: Mapped[str | None] = mapped_column(Text)
    eligibility: Mapped[str | None] = mapped_column(Text)
    language_test_requirements: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    website: Mapped[str | None] = mapped_column(String(2048))
    application_url: Mapped[str | None] = mapped_column(String(2048))
    funding_status: Mapped[FundingStatus] = mapped_column(
        str_enum(FundingStatus, 20),
        default=FundingStatus.unknown,
        server_default=FundingStatus.unknown.value,
    )
    funding_amount: Mapped[str | None] = mapped_column(String(200))
    research_interests: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    publication_links: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default="[]"
    )
    required_documents: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default="[]"
    )
    status: Mapped[ResearchStatus] = mapped_column(
        str_enum(ResearchStatus, 30),
        default=ResearchStatus.discovered,
        server_default=ResearchStatus.discovered.value,
    )
    application_date: Mapped[date | None] = mapped_column(Date)
    deadline: Mapped[date | None] = mapped_column(Date)
