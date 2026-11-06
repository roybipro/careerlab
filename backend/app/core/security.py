import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import TYPE_CHECKING, Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import get_settings
from app.core.errors import AppError

if TYPE_CHECKING:
    from app.modules.auth.models import User

COOKIE_NAME = "careerlab_session"
SESSION_DAYS = 7
SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60
_ALGORITHM = "HS256"

_hasher = PasswordHasher()

# Each Argon2 run takes tens of MiB, and the login limiters can be sidestepped with spoofed
# client IPs. Cap how many run at once and answer 429 when a request cannot get a slot soon.
MAX_CONCURRENT_HASHES = get_settings().MAX_CONCURRENT_HASHES
SLOT_WAIT_SECONDS = 2.0
_hash_slots = threading.BoundedSemaphore(MAX_CONCURRENT_HASHES)


@contextmanager
def _hash_slot() -> Iterator[None]:
    if not _hash_slots.acquire(timeout=SLOT_WAIT_SECONDS):
        raise AppError(429, "rate_limited", "The server is busy, try again in a moment")
    try:
        yield
    finally:
        _hash_slots.release()


def hash_password(password: str) -> str:
    with _hash_slot():
        return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    with _hash_slot():
        try:
            return _hasher.verify(password_hash, password)
        except (VerificationError, InvalidHashError):
            return False


@lru_cache
def dummy_hash() -> str:
    """Compared against when the email is unknown, so timing doesn't reveal accounts."""
    return hash_password("not-a-real-password")


def create_token(user: "User") -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "ver": user.token_version,
        "iat": now,
        "exp": now + timedelta(days=SESSION_DAYS),
    }
    return jwt.encode(payload, get_settings().JWT_SECRET, algorithm=_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            get_settings().JWT_SECRET,
            algorithms=[_ALGORITHM],
            options={"require": ["exp", "sub", "ver"]},
        )
    except jwt.PyJWTError:
        raise AppError(401, "unauthorized", "Not authenticated") from None
    return payload
