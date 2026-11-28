"""Sends one email through Resend's HTTP API (https://resend.com/docs/api-reference/emails).

Uses the standard library so the API needs no extra dependency. Tests replace `send_email`.
"""

import json
import logging
import urllib.error
import urllib.request

from app.core.config import get_settings

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"
TIMEOUT_SECONDS = 15


class EmailError(Exception):
    pass


def send_email(*, to: str, subject: str, html: str, text: str, headers: dict[str, str]) -> None:
    settings = get_settings()
    body = json.dumps(
        {
            "from": settings.EMAIL_FROM,
            "to": [to],
            "subject": subject,
            "html": html,
            "text": text,
            "headers": headers,
        }
    ).encode()
    request = urllib.request.Request(  # noqa: S310 - fixed https URL
        RESEND_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.RESEND_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "careerlab-digest",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read()[:500].decode(errors="replace")
        raise EmailError(f"Resend returned {exc.code}: {detail}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise EmailError(f"Could not reach Resend: {exc}") from exc
