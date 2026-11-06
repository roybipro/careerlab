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


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
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
