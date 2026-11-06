import uuid
from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.schemas import HttpUrl, Name
from app.modules.contacts.models import ContactType
from app.modules.entity_types import LinkableType


class _ContactFields(BaseModel):
    """Optional fields shared by create and update."""

    email: Annotated[str, Field(max_length=320)] | None = None
    organization: Annotated[str, Field(max_length=200)] | None = None
    position: Annotated[str, Field(max_length=200)] | None = None
    contact_type: ContactType | None = None
    linkedin_url: HttpUrl | None = None
    website: HttpUrl | None = None
    last_contacted_at: date | None = None
    next_follow_up_at: date | None = None
    notes: Annotated[str, Field(max_length=50_000)] | None = None


class ContactCreate(_ContactFields):
    name: Name


class ContactUpdate(_ContactFields):
    """Only fields present in the body change; an explicit null clears an optional field."""

    name: Name | None = None

    @model_validator(mode="after")
    def _name_cannot_be_null(self) -> "ContactUpdate":
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self


class ContactFilters(BaseModel):
    contact_type: ContactType | None = None
    entity_type: LinkableType | None = None
    entity_id: uuid.UUID | None = None
    follow_up_due: bool | None = None


class ContactLinkIn(BaseModel):
    entity_type: LinkableType
    entity_id: uuid.UUID


class ContactLinkOut(BaseModel):
    id: uuid.UUID
    entity_type: LinkableType
    entity_id: uuid.UUID
    label: str


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str | None
    organization: str | None
    position: str | None
    contact_type: ContactType | None
    linkedin_url: str | None
    website: str | None
    last_contacted_at: date | None
    next_follow_up_at: date | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class ContactDetail(ContactOut):
    links: list[ContactLinkOut]
