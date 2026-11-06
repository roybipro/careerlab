import enum
import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Index, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, str_enum
from app.modules.entity_types import LinkableType


class ContactType(enum.StrEnum):
    recruiter = "recruiter"
    professor = "professor"
    researcher = "researcher"
    hiring_manager = "hiring_manager"
    university_representative = "university_representative"
    other = "other"


class Contact(TimestampMixin, Base):
    __tablename__ = "contacts"
    __table_args__ = (Index("ix_contacts_user_follow_up", "user_id", "next_follow_up_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(320))
    organization: Mapped[str | None] = mapped_column(String(200))
    position: Mapped[str | None] = mapped_column(String(200))
    contact_type: Mapped[ContactType | None] = mapped_column(str_enum(ContactType, 30))
    linkedin_url: Mapped[str | None] = mapped_column(String(2048))
    website: Mapped[str | None] = mapped_column(String(2048))
    last_contacted_at: Mapped[date | None] = mapped_column(Date)
    next_follow_up_at: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)


class ContactLink(Base):
    __tablename__ = "contact_links"
    __table_args__ = (
        UniqueConstraint(
            "contact_id", "entity_type", "entity_id", name="uq_contact_links_contact_entity"
        ),
        Index("ix_contact_links_user_entity", "user_id", "entity_type", "entity_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    contact_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("contacts.id", ondelete="CASCADE")
    )
    entity_type: Mapped[LinkableType] = mapped_column(str_enum(LinkableType))
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid)
