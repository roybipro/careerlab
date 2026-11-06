FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Runtime dependencies only, read from pyproject.toml so versions are pinned in one place.
COPY pyproject.toml ./
RUN python -c "import tomllib; print('\n'.join(tomllib.load(open('pyproject.toml', 'rb'))['project']['dependencies']))" > /tmp/requirements.txt \
    && pip install -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
# Operational scripts, such as the demo seed. Tests stay out of the image.
COPY scripts ./scripts

RUN useradd --create-home --uid 10001 careerlab
USER careerlab

ENV PORT=8000
EXPOSE 8000

# Migrate, then serve. exec makes uvicorn PID 1 so it receives stop signals.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
