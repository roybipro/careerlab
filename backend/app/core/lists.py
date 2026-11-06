from collections.abc import Mapping
from datetime import date, datetime
from typing import Annotated, Any

from fastapi import Depends, Query
from pydantic import BaseModel
from sqlalchemy import ColumnElement, Select, SQLColumnExpression, func, inspect, select
from sqlalchemy.orm import Session

from app.core.errors import AppError

MAX_PAGE_SIZE = 100
# Keeps (page - 1) * page_size far below the 64-bit OFFSET limit.
MAX_PAGE = 1_000_000


def escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def contains(column: SQLColumnExpression[Any], term: str) -> ColumnElement[bool]:
    """Case-insensitive substring match that treats `%` and `_` literally."""
    return column.ilike(f"%{escape_like(term)}%", escape="\\")


def iso(value: date | datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


class ListParams:
    def __init__(
        self,
        page: Annotated[int, Query(ge=1, le=MAX_PAGE)] = 1,
        page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
        sort: Annotated[str | None, Query(max_length=50)] = None,
        q: Annotated[str | None, Query(max_length=200)] = None,
    ) -> None:
        self.page = page
        self.page_size = page_size
        self.sort = sort
        self.q = q.strip() if q and q.strip() else None


ListQuery = Annotated[ListParams, Depends()]


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


def paginate(
    db: Session,
    stmt: Select[Any],
    params: ListParams,
    sort_fields: Mapping[str, SQLColumnExpression[Any]],
    default_sort: str,
) -> Page[Any]:
    sort = params.sort or default_sort
    name = sort.removeprefix("-")
    column = sort_fields.get(name)
    if column is None:
        raise AppError(
            422,
            "validation_error",
            f"Cannot sort by '{name}'",
            {"allowed": sorted(sort_fields)},
        )
    ordering = column.desc() if sort.startswith("-") else column.asc()
    # Nulls last in both directions, and the primary key as a tiebreaker so rows
    # with equal sort values keep a stable order across pages.
    primary_key = inspect(stmt.column_descriptions[0]["entity"]).primary_key

    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = db.scalars(
        stmt.order_by(ordering.nulls_last(), *primary_key)
        .offset((params.page - 1) * params.page_size)
        .limit(params.page_size)
    ).all()
    return Page(items=list(items), total=total, page=params.page, page_size=params.page_size)
