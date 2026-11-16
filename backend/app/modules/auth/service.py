import secrets
from typing import Any

import jwt
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import dummy_hash, hash_password, verify_password
from app.modules.auth.models import User


def _email_conflict() -> AppError:
    return AppError(409, "conflict", "Email is already registered")


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.lower()))


def register(db: Session, full_name: str, email: str, password: str) -> User:
    if get_user_by_email(db, email) is not None:
        raise _email_conflict()
    user = User(full_name=full_name, email=email.lower(), password_hash=hash_password(password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _email_conflict() from None
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    user = get_user_by_email(db, email)
    # Always run one Argon2 verification so timing doesn't reveal whether the email exists.
    valid = verify_password(password, user.password_hash if user else dummy_hash())
    if user is None or not valid:
        raise AppError(401, "unauthorized", "Invalid email or password")
    return user


_google_keys = jwt.PyJWKClient("https://www.googleapis.com/oauth2/v3/certs", cache_keys=True)


def verify_google_credential(credential: str) -> dict[str, Any]:
    client_id = get_settings().GOOGLE_CLIENT_ID
    if not client_id:
        raise AppError(404, "not_found", "Google sign-in is not enabled")
    try:
        key = _google_keys.get_signing_key_from_jwt(credential).key
        claims: dict[str, Any] = jwt.decode(
            credential,
            key,
            algorithms=["RS256"],
            audience=client_id,
            issuer=["accounts.google.com", "https://accounts.google.com"],
        )
    except (jwt.PyJWTError, jwt.PyJWKClientError):
        raise AppError(401, "unauthorized", "Google sign-in failed") from None
    if claims.get("email_verified") is not True or not claims.get("email"):
        raise AppError(401, "unauthorized", "Google sign-in failed")
    return claims


def google_login(db: Session, credential: str) -> User:
    claims = verify_google_credential(credential)
    email = str(claims["email"]).lower()
    # A verified Google email signs in to the account already registered with it.
    user = get_user_by_email(db, email)
    if user is not None:
        return user
    full_name = (str(claims.get("name") or "").strip() or email.split("@")[0])[:120]
    # Random unusable password: the account signs in with Google until the user sets one.
    user = User(
        full_name=full_name, email=email, password_hash=hash_password(secrets.token_urlsafe(32))
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = get_user_by_email(db, email)
        if existing is None:
            raise
        return existing
    return user


def update_profile(db: Session, user: User, full_name: str | None, email: str | None) -> User:
    if email is not None and email != user.email:
        existing = get_user_by_email(db, email)
        if existing is not None and existing.id != user.id:
            raise _email_conflict()
        user.email = email.lower()
    if full_name is not None:
        user.full_name = full_name
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _email_conflict() from None
    return user


def change_password(db: Session, user: User, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.password_hash):
        # Not 401: the frontend treats 401 as an expired session and redirects to login.
        raise AppError(
            422,
            "validation_error",
            "Current password is incorrect",
            [
                {
                    "loc": ["body", "current_password"],
                    "message": "Current password is incorrect",
                    "type": "incorrect_password",
                }
            ],
        )
    user.password_hash = hash_password(new_password)
    user.token_version += 1
    db.commit()
