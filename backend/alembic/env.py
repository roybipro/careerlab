from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app.core.config import get_settings
from app.core.db import Base
from app.modules.activity import models as _activity_models  # noqa: F401  (registers tables)
from app.modules.auth import models as _auth_models  # noqa: F401
from app.modules.contacts import models as _contacts_models  # noqa: F401
from app.modules.jobs import models as _jobs_models  # noqa: F401
from app.modules.notes import models as _notes_models  # noqa: F401
from app.modules.reminders import models as _reminders_models  # noqa: F401
from app.modules.research import models as _research_models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=get_settings().DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(get_settings().DATABASE_URL)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
