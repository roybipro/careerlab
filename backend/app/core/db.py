import enum
from collections.abc import Iterator
from datetime import datetime
from functools import lru_cache

from sqlalchemy import DateTime, Engine, Enum, create_engine, func
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


def str_enum(cls: type[enum.StrEnum], length: int = 20) -> Enum:
    # Stored as plain text; each migration adds the CHECK constraints.
    return Enum(cls, native_enum=False, length=length, create_constraint=False)


@lru_cache
def get_engine() -> Engine:
    return create_engine(get_settings().DATABASE_URL, pool_pre_ping=True)


def get_db() -> Iterator[Session]:
    with sessionmaker(bind=get_engine(), expire_on_commit=False)() as session:
        yield session
