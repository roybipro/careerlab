from typing import Annotated, Any

from fastapi import Depends, Query
from pydantic import BaseModel
from sqlalchemy import ColumnElement, Select, func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError

MAX_PAGE_SIZE = 100


def escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class ListParams:
    def __init__(
        self,
        page: Annotated[int, Query(ge=1)] = 1,
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
    sort_fields: dict[str, ColumnElement[Any]],
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

    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = db.scalars(
        stmt.order_by(ordering).offset((params.page - 1) * params.page_size).limit(params.page_size)
    ).all()
    return Page(items=list(items), total=total, page=params.page, page_size=params.page_size)
