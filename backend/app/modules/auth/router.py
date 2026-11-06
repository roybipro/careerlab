from fastapi import APIRouter, Depends, Request, Response

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, require_csrf
from app.core.rate_limit import RateLimiter, client_ip
from app.core.security import COOKIE_NAME, SESSION_SECONDS, create_token
from app.modules.auth import service
from app.modules.auth.models import User
from app.modules.auth.schemas import (
    ChangePasswordIn,
    LoginIn,
    ProfileUpdateIn,
    RegisterIn,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"], dependencies=[Depends(require_csrf)])

_register_ip_limiter = RateLimiter(
    limit=get_settings().RATE_LIMIT_REGISTER_PER_MINUTE, window_seconds=60
)
_register_global_limiter = RateLimiter(limit=30, window_seconds=60)
_login_ip_limiter = RateLimiter(limit=10, window_seconds=60)
_login_email_limiter = RateLimiter(limit=5, window_seconds=60)


def _set_session_cookie(response: Response, user: User) -> None:
    response.set_cookie(
        COOKIE_NAME,
        create_token(user),
        max_age=SESSION_SECONDS,
        httponly=True,
        samesite="lax",
        secure=get_settings().COOKIE_SECURE,
        path="/",
    )


@router.post("/register", status_code=201, response_model=UserOut)
def register(body: RegisterIn, request: Request, response: Response, db: DbSession) -> User:
    _register_ip_limiter.check(client_ip(request))
    # Backstop in case forwarded client IPs are spoofed.
    _register_global_limiter.check("all")
    user = service.register(db, body.full_name, body.email, body.password)
    _set_session_cookie(response, user)
    return user


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response, db: DbSession) -> User:
    _login_ip_limiter.check(client_ip(request))
    _login_email_limiter.check(body.email)
    user = service.authenticate(db, body.email, body.password)
    _set_session_cookie(response, user)
    return user


@router.post("/logout", status_code=204)
def logout(response: Response) -> None:
    response.delete_cookie(
        COOKIE_NAME,
        httponly=True,
        samesite="lax",
        secure=get_settings().COOKIE_SECURE,
        path="/",
    )


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileUpdateIn, user: CurrentUser, db: DbSession) -> User:
    return service.update_profile(db, user, body.full_name, body.email)


@router.post("/change-password", status_code=204)
def change_password(
    body: ChangePasswordIn, response: Response, user: CurrentUser, db: DbSession
) -> None:
    service.change_password(db, user, body.current_password, body.new_password)
    _set_session_cookie(response, user)
