# Contributing

Thanks for taking a look. This is a portfolio project, but fixes and suggestions are welcome.
Open an issue before starting anything large.

## Setup

Follow "Local development" in the [README](README.md): copy `.env.example` to `.env`, set
`JWT_SECRET`, start the database with `docker compose up -d db`, then run the backend and
frontend. Use Python 3.12 and Node 24.

Never commit `.env` or any real credential. The repository is public, and CI scans the full
history with gitleaks. Run `git diff --cached` before each commit.

## Branches and commits

- Branch from `main`. Name branches `feature/<name>`, `fix/<name>` or `docs/<name>`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `ci:`, `chore:`, with an optional scope such as
  `feat(frontend):`. Keep the first line short and say why in the body when it is not obvious.
- Open a pull request into `main`. CI must pass.

## Code rules

- Routers contain no queries. Put them in the module's `service.py`.
- Every service function takes the current user and filters by `user_id`. A missing record and
  someone else's record both return `404`.
- Errors use the `{"error": {"code", "message", "details"}}` shape.
- Add a migration in `backend/alembic/versions/` for any model change.
- Tests run against real PostgreSQL, not SQLite.

## Running the checks

Backend, from `backend/` with the virtual environment active and the database running:

```bash
ruff check .
mypy app
pytest
```

Frontend, from `frontend/`:

```bash
npm run lint
npm run typecheck
npm run build
```

End-to-end tests are described under "Tests" in the README. CI runs them on pull requests.
