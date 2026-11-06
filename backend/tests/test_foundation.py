from collections.abc import Iterator

import pytest
from sqlalchemy import Integer, String, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.core.db import Base, TimestampMixin
from app.core.errors import AppError, not_found
from app.core.lists import ListParams, escape_like, paginate


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_unknown_route_uses_error_envelope(client):
    r = client.get("/api/v1/nope")
    assert r.status_code == 404
    assert r.json() == {"error": {"code": "not_found", "message": "Not Found", "details": None}}


def test_validation_error_uses_envelope(client):
    r = client.get("/api/v1/_test/validate?n=abc")
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    assert r.json()["error"]["details"][0]["loc"] == ["query", "n"]


def test_swagger_stays_available(client):
    assert client.get("/openapi.json").status_code == 200
    assert client.get("/docs").status_code == 200


def test_raw_client_omits_csrf_header(client, raw_client):
    assert client.headers["X-Requested-With"] == "CareerLab"
    assert "X-Requested-With" not in raw_client.headers


def test_not_found_helper():
    err = not_found()
    assert isinstance(err, AppError) and err.status == 404 and err.code == "not_found"


def test_escape_like():
    assert escape_like("50%_a\\") == "50\\%\\_a\\\\"


class Widget(TimestampMixin, Base):
    __tablename__ = "_test_widgets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String)


@pytest.fixture
def widgets(db: Session) -> Iterator[None]:
    Base.metadata.create_all(db.get_bind(), tables=[Widget.__table__])  # type: ignore[list-item]
    db.add_all(Widget(name=f"w{i:02d}") for i in range(25))
    db.commit()
    yield
    db.close()
    Base.metadata.drop_all(db.get_bind(), tables=[Widget.__table__])  # type: ignore[list-item]


SORTS = {"name": Widget.name}


def test_paginate_first_page_and_sort(db, widgets):
    page = paginate(db, select(Widget), ListParams(), SORTS, "name")
    assert page.total == 25 and page.page == 1 and page.page_size == 20
    assert [w.name for w in page.items][:2] == ["w00", "w01"] and len(page.items) == 20


def test_paginate_descending_sort(db, widgets):
    page = paginate(db, select(Widget), ListParams(sort="-name"), SORTS, "name")
    assert page.items[0].name == "w24"


def test_paginate_page_beyond_end_is_empty_with_total(db, widgets):
    page = paginate(db, select(Widget), ListParams(page=99), SORTS, "name")
    assert page.items == [] and page.total == 25 and page.page == 99


def test_paginate_rejects_unknown_sort(db, widgets):
    with pytest.raises(AppError) as exc:
        paginate(db, select(Widget), ListParams(sort="password"), SORTS, "name")
    assert exc.value.status == 422 and exc.value.code == "validation_error"
