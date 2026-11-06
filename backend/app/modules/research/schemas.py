import uuid
from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.core.schemas import HttpUrl, Name
from app.modules.research.models import (
    FundingStatus,
    OpportunityType,
    ResearchStatus,
)

Text = Annotated[str, Field(max_length=50_000)]
ShortText = Annotated[str, Field(max_length=200)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class PublicationLink(BaseModel):
    title: Label
    url: HttpUrl


class RequiredDocument(BaseModel):
    name: Label
    done: bool = False


class _ResearchFields(BaseModel):
    """Optional fields shared by create and update."""

    opportunity_type: OpportunityType | None = None
    country: Annotated[str, Field(max_length=100)] | None = None
    department: ShortText | None = None
    laboratory: ShortText | None = None
    research_area: ShortText | None = None
    professor_name: ShortText | None = None
    professor_email: Annotated[str, Field(max_length=320)] | None = None
    professor_website: HttpUrl | None = None
    description: Text | None = None
    eligibility: Text | None = None
    language_test_requirements: Text | None = None
    notes: Text | None = None
    website: HttpUrl | None = None
    application_url: HttpUrl | None = None
    funding_amount: ShortText | None = None
    application_date: date | None = None
    deadline: date | None = None


class ResearchCreate(_ResearchFields):
    title: Name
    organization: Name
    funding_status: FundingStatus = FundingStatus.unknown
    status: ResearchStatus = ResearchStatus.discovered
    research_interests: list[Label] = Field(default_factory=list, max_length=100)
    publication_links: list[PublicationLink] = Field(default_factory=list, max_length=100)
    required_documents: list[RequiredDocument] = Field(default_factory=list, max_length=100)


class ResearchUpdate(_ResearchFields):
    """Only fields present in the body change; an explicit null clears an optional field.

    The three list fields are replaced as a whole, which is how a checklist item is toggled.
    """

    title: Name | None = None
    organization: Name | None = None
    funding_status: FundingStatus | None = None
    status: ResearchStatus | None = None
    research_interests: list[Label] | None = Field(default=None, max_length=100)
    publication_links: list[PublicationLink] | None = Field(default=None, max_length=100)
    required_documents: list[RequiredDocument] | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def _required_fields_cannot_be_null(self) -> "ResearchUpdate":
        for field in (
            "title",
            "organization",
            "funding_status",
            "status",
            "research_interests",
            "publication_links",
            "required_documents",
        ):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class ResearchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    organization: str
    opportunity_type: OpportunityType | None
    country: str | None
    department: str | None
    laboratory: str | None
    research_area: str | None
    professor_name: str | None
    professor_email: str | None
    professor_website: str | None
    description: str | None
    eligibility: str | None
    language_test_requirements: str | None
    notes: str | None
    website: str | None
    application_url: str | None
    funding_status: FundingStatus
    funding_amount: str | None
    research_interests: list[str]
    publication_links: list[PublicationLink]
    required_documents: list[RequiredDocument]
    status: ResearchStatus
    application_date: date | None
    deadline: date | None
    created_at: datetime
    updated_at: datetime


class ResearchFilters(BaseModel):
    status: ResearchStatus | None = None
    opportunity_type: OpportunityType | None = None
    funding_status: FundingStatus | None = None
    country: str | None = None
    deadline_from: date | None = None
    deadline_to: date | None = None
