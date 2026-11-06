from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

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
        raise AppError(401, "unauthorized", "Current password is incorrect")
    user.password_hash = hash_password(new_password)
    user.token_version += 1
    db.commit()
