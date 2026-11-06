from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.modules.activity.router import router as activity_router
from app.modules.auth.router import router as auth_router
from app.modules.contacts.router import router as contacts_router
from app.modules.jobs.router import router as jobs_router
from app.modules.notes.router import router as notes_router
from app.modules.reminders.router import router as reminders_router
from app.modules.research.router import router as research_router


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

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
