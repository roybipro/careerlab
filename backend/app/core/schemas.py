"""Pydantic field types shared by every resource."""

from typing import Annotated
from urllib.parse import urlparse

from pydantic import AfterValidator, Field, StringConstraints


def _http_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("must be an http or https URL")
    return value


HttpUrl = Annotated[str, Field(max_length=2048), AfterValidator(_http_url)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
