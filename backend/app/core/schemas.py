"""Pydantic field types shared by every resource."""

from datetime import datetime
from typing import Annotated
from urllib.parse import urlparse

from pydantic import AfterValidator, AwareDatetime, Field, StringConstraints


def _http_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("must be an http or https URL")
    return value


HttpUrl = Annotated[str, Field(max_length=2048), AfterValidator(_http_url)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


MIN_TIMESTAMP_YEAR = 1900
MAX_TIMESTAMP_YEAR = 2200


def _bounded_year(value: datetime) -> datetime:
    # Checked on the year as written, before any conversion: converting 0001-01-01 with a
    # positive offset to UTC overflows, and years like these break list pages when rendered.
    if not MIN_TIMESTAMP_YEAR <= value.year <= MAX_TIMESTAMP_YEAR:
        raise ValueError(f"year must be between {MIN_TIMESTAMP_YEAR} and {MAX_TIMESTAMP_YEAR}")
    return value


# A timestamp with a UTC offset and a sensible year.
BoundedDatetime = Annotated[AwareDatetime, AfterValidator(_bounded_year)]
