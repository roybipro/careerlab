from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.modules.activity.router import router as activity_router
from app.modules.auth.router import router as auth_router
from app.modules.contacts.router import router as contacts_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.jobs.router import router as jobs_router
from app.modules.notes.router import router as notes_router
from app.modules.reminders.router import router as reminders_router
from app.modules.research.router import router as research_router

CSRF_HEADER_NAME = "X-Requested-With"
CSRF_HEADER_VALUE = "CareerLab"
_CSRF_METHODS = ("post", "patch", "delete")


def _declare_csrf_header(app: FastAPI) -> None:
    """Add the CSRF header to every unsafe operation in the OpenAPI schema.

    Declaring it lets Swagger UI send it (prefilled), so "Try it out" works on mutations.
    The check itself still reads the raw request header, and a cross-site page still cannot
    send the header without passing a CORS preflight.
    """
    build_schema = app.openapi
    declared = False

    def custom_openapi() -> dict[str, Any]:
        nonlocal declared
        # FastAPI caches the schema it builds, so the header is added to it only once.
        schema = build_schema()
        if declared:
            return schema
        for path_item in schema["paths"].values():
            for method in _CSRF_METHODS:
                operation = path_item.get(method)
                if operation is None:
                    continue
                operation.setdefault("parameters", []).append(
                    {
                        "name": CSRF_HEADER_NAME,
                        "in": "header",
                        "required": True,
                        "description": "CSRF guard. Must be exactly CareerLab.",
                        "schema": {
                            "type": "string",
                            "default": CSRF_HEADER_VALUE,
                            "title": CSRF_HEADER_NAME,
                        },
                    }
                )
        declared = True
        return schema

    app.openapi = custom_openapi  # type: ignore[method-assign]


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="CareerLab API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.FRONTEND_ORIGIN],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(jobs_router, prefix="/api/v1")
    app.include_router(research_router, prefix="/api/v1")
    app.include_router(contacts_router, prefix="/api/v1")
    app.include_router(reminders_router, prefix="/api/v1")
    app.include_router(notes_router, prefix="/api/v1")
    app.include_router(activity_router, prefix="/api/v1")
    app.include_router(dashboard_router, prefix="/api/v1")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    _declare_csrf_header(app)
    return app


app = create_app()
