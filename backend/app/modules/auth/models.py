import uuid
from datetime import date

from sqlalchemy import Boolean, Date, Integer, String, Uuid, false
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # SHA-256 of the secret in the user's calendar feed link; null while the feed is off.
    # Only the hash is stored, so the link is shown once when made and can only be replaced.
    calendar_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    # The opt-in daily email digest, and the (UTC) day it was last sent, so a retried run
    # does not send it twice.
    email_digest: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    last_digest_on: Mapped[date | None] = mapped_column(Date)
