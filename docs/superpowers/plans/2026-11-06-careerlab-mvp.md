# CareerLab MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, test, document and deploy the CareerLab MVP: a private workspace for job applications, research opportunities, contacts, reminders and analytics.

**Architecture:** A monorepo with a FastAPI backend (`routers → services → models`, one module per domain) and a Next.js App Router frontend that proxies `/api/v1/*` to the API, so session cookies stay on one domain. PostgreSQL is used everywhere, including tests.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2 (sync, psycopg 3), Pydantic 2, Alembic, argon2-cffi, PyJWT, pytest, ruff, mypy. Next.js, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form, Zod, Recharts, dnd-kit, Playwright. PostgreSQL 16, Docker Compose, GitHub Actions, Vercel, Render, Neon.

**Spec:** `docs/superpowers/specs/2026-11-06-careerlab-design.md`. Field lists, enums, routes, filters and dashboard definitions live there and are not repeated here. Implementers read both documents.

## Global Constraints

- Base path `/api/v1`, except `GET /health`. Swagger at `/docs` and `/openapi.json` stay on in production.
- Errors are always `{"error": {"code", "message", "details"}}`.
- Lists accept `page`, `page_size` (default 20, maximum 100), `sort`, `q`, and return `{items, total, page, page_size}`.
- Every service function takes the current user and filters by `user_id`. A record that is missing or owned by someone else returns `404`.
- Routers contain no queries.
- `POST`, `PATCH` and `DELETE` require `X-Requested-With: CareerLab`, otherwise `403`.
- Session cookie: name `careerlab_session`, `HttpOnly`, `SameSite=Lax`, `Secure` when `COOKIE_SECURE=true`, expires after 7 days.
- Passwords are 10 to 128 characters, hashed with Argon2. Emails are stored lowercase.
- Tests use real PostgreSQL, never SQLite.
- No secrets in git. The repo is public, so run `git diff --cached` before each commit and confirm no real credentials are in it.
- **Git flow for every task:** branch from up-to-date `main` as named in the task, push after each commit, and once the task's tests pass run `git switch main && git merge --no-ff <branch> && git push`. Commit from inside `careerlab/` only. Commit messages use Conventional Commits and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

Each item has a test in the task that owns the code.

1. Registering `Ana@X.com` after `ana@x.com`, or logging in with different capitalization, should act as one account: `409` on register and a successful login. Never a `500`. (Task 2)
2. A `PATCH` sending only `salary_min` above the stored `salary_max` should return `422`, and sending `null` should clear an optional field. (Task 3)
3. Searching for a literal `50%` or `a_b` should match only those characters. (Task 3)
4. A session that expires mid-use should send the user to login, not leave spinners or empty pages. Every query's failure should show a retry, including when the API is waking from sleep. (Task 8)
5. A deadline falling today counts as upcoming and not overdue, and a `due_at` with no UTC offset returns `422` rather than being guessed. (Tasks 5 and 6)

---

## Backend

### Task 1: Backend foundation

**Branch:** `feature/backend-foundation`

**Files:**
- Create: `docker-compose.yml` (Postgres 16 only for now, port `5433:5432`, with databases `careerlab` and `careerlab_test`), `.env.example`, `backend/pyproject.toml`, `backend/alembic.ini`, `backend/alembic/env.py`
- Create: `backend/app/main.py`, `backend/app/core/config.py`, `backend/app/core/db.py`, `backend/app/core/errors.py`, `backend/app/core/lists.py`
- Test: `backend/tests/conftest.py`, `backend/tests/test_foundation.py`

**Interfaces:**
- Produces:
  - `create_app() -> FastAPI`; `Settings` with `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECURE`, `FRONTEND_ORIGIN`, `TRUST_PROXY`; `get_settings()`
  - `Base`, `TimestampMixin`, `get_db() -> Iterator[Session]`
  - `AppError(status: int, code: str, message: str, details=None)`, `not_found() -> AppError`
  - `escape_like(term: str) -> str`
  - `ListParams` dependency with `page`, `page_size`, `sort`, `q`
  - `paginate(db, stmt, params, sort_fields: dict[str, ColumnElement], default_sort: str) -> Page`
  - `Page[T]` Pydantic generic
  - Test fixtures: `db`, `client` (sends the CSRF header by default), `raw_client` (does not)

- [ ] **Step 1:** Confirm prerequisites. Run `docker info --format '{{.ServerVersion}}'` and expect a version. If it's blank, ask the user to start Docker Desktop. Find Python 3.12 with `python3.12 --version`, and if it's missing, install it with `brew install python@3.12`. Create `backend/.venv` from it.
- [ ] **Step 2: Write failing tests** in `test_foundation.py`:

```python
def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}

def test_unknown_route_uses_error_envelope(client):
    body = client.get("/api/v1/nope").json()
    assert body["error"]["code"] == "not_found"

def test_validation_error_uses_envelope(client):  # uses a test-only route with a required int query
    r = client.get("/api/v1/_test/validate?n=abc")
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"

def test_escape_like():
    assert escape_like("50%_a\\") == "50\\%\\_a\\\\"
```

- [ ] **Step 3:** Run `pytest tests/test_foundation.py -v`. Expected: FAIL (import errors).
- [ ] **Step 4:** Implement the files above. `conftest.py` runs `alembic upgrade head` once against `careerlab_test`, then truncates all tables after each test. `paginate` rejects an unknown sort field with `422`, and a page beyond the end returns an empty `items` with the correct `total`. Register the test-only route inside `conftest.py`, not in the app.
- [ ] **Step 5:** Run `pytest -v && ruff check . && mypy app`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(backend): add API foundation, error envelope and test harness`

### Task 2: Authentication

**Branch:** `feature/auth`

**Files:**
- Create: `backend/app/core/security.py`, `backend/app/core/rate_limit.py`, `backend/app/core/deps.py`
- Create: `backend/app/modules/auth/{models,schemas,service,router}.py`
- Create: the first Alembic migration
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Produces:
  - `current_user` dependency returning `User`; `require_csrf` dependency, applied at router level
  - `hash_password`, `verify_password`, `create_token(user) -> str`, `decode_token(token) -> dict`
  - `RateLimiter(limit: int, window_seconds: int).check(key: str) -> None`, raising `429`
  - `client_ip(request) -> str`, which uses the first `X-Forwarded-For` entry only when `TRUST_PROXY=true`
  - Test fixtures: `register_user(client, email=...) -> dict` and `second_client` (a separately logged-in user)

- [ ] **Step 1: Write failing tests**, named:
  - `test_register_sets_httponly_cookie_and_returns_user_without_hash`
  - `test_register_duplicate_email_any_case_returns_409`, registering `ana@x.com` then `Ana@X.com`
  - `test_concurrent_duplicate_register_returns_409`, which forces the `IntegrityError` path by mocking the pre-check
  - `test_login_is_case_insensitive`
  - `test_login_wrong_password_and_unknown_email_return_same_401_message`
  - `test_password_shorter_than_10_or_longer_than_128_returns_422`
  - `test_me_requires_auth`
  - `test_update_profile`, which also asserts a taken email returns `409`
  - `test_change_password_requires_current_password`
  - `test_change_password_invalidates_old_tokens_but_keeps_this_session`
  - `test_logout_clears_cookie`
  - `test_expired_or_tampered_token_returns_401`
  - `test_mutation_without_csrf_header_returns_403`, using `raw_client`
  - `test_login_limit_5_per_minute_per_email_returns_429`
  - `test_register_limit_5_per_minute_per_ip_returns_429`
- [ ] **Step 2:** Run `pytest tests/test_auth.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement. Compare a dummy Argon2 hash for unknown emails, so login timing doesn't reveal which emails exist. Catch `IntegrityError` on the unique email and convert it to `409`. Reset limiter state between tests with a fixture. Limits: login 10/min per IP and 5/min per email, register 5/min per IP.
- [ ] **Step 4:** Run `pytest -v`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): add registration, sessions, profile and rate limits`

### Task 3: Activity log and jobs

**Branch:** `feature/jobs-api`

**Files:**
- Create: `backend/app/modules/activity/{models,schemas,service,router}.py`, `backend/app/modules/jobs/{models,schemas,service,router}.py`, migration
- Test: `backend/tests/test_jobs.py`, `backend/tests/isolation.py`

**Interfaces:**
- Produces:
  - `log_activity(db, user, entity_type, entity_id, action, label, **meta) -> None`. It does not commit. The ORM attribute is `meta`, mapped to the column `metadata`, because `metadata` is reserved on SQLAlchemy models. The API field is `metadata`.
  - `GET /activity` filterable by `entity_type` and `entity_id`
  - `jobs.service`: `list_jobs`, `get_job(db, user, id) -> JobApplication`, `create_job`, `update_job`, `delete_job`
  - `assert_isolated(owner_client, other_client, url, patch_body)`, reused by every later resource test. It asserts `404` on `GET`, `PATCH` and `DELETE` for the other user, and that the record is unchanged for the owner.

- [ ] **Step 1: Write failing tests**, named:
  - `test_create_job_defaults_status_wishlist_priority_medium`
  - `test_required_fields_missing_returns_422`
  - `test_get_update_delete_job`
  - `test_non_uuid_id_returns_422`
  - `test_jobs_are_isolated_between_users`, using `assert_isolated`
  - `test_list_paginates_and_reports_total`
  - `test_page_size_over_100_returns_422`
  - `test_sort_by_deadline_desc_and_unknown_sort_returns_422`
  - `test_filter_by_each_of_company_position_status_priority_job_type_and_date_ranges`
  - `test_search_q_treats_percent_and_underscore_literally`, with jobs `50% Corp`, `500 Corp`, `a_b` and `axb`
  - `test_patch_salary_min_above_stored_max_returns_422`
  - `test_patch_null_clears_optional_field`
  - `test_patch_omitted_field_is_unchanged`
  - `test_activity_created_status_changed_with_old_and_new`
  - `test_activity_deadline_updated_and_interview_scheduled`
  - `test_no_activity_when_patch_changes_nothing`
  - `test_activity_list_excludes_other_users`
- [ ] **Step 2:** Run `pytest tests/test_jobs.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement. Use `exclude_unset` so `null` and omitted fields behave differently. Merge stored values with the patch before checking the salary rule. Add the `CHECK` constraint and the spec's indexes in the migration. Reject `company_logo_url`, `job_url` and `company_website` values that aren't `http(s)`, so a `javascript:` link can't be rendered later.
- [ ] **Step 4:** Run `pytest -v`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(jobs): add job application API and activity log`

### Task 4: Research opportunities

**Branch:** `feature/research-api`

**Files:**
- Create: `backend/app/modules/research/{models,schemas,service,router}.py`, migration
- Test: `backend/tests/test_research.py`

**Interfaces:**
- Consumes: `paginate`, `log_activity`, `assert_isolated`.
- Produces: `research.service` with `list_research`, `get_research`, `create_research`, `update_research`, `delete_research`, matching the jobs signatures.

- [ ] **Step 1: Write failing tests**, named:
  - `test_create_defaults_status_discovered_funding_unknown`
  - `test_research_isolated_between_users`
  - `test_filter_by_status_type_funding_country_deadline_range`
  - `test_search_q_matches_title_organization_professor_area`
  - `test_required_documents_round_trip_and_toggle_done`
  - `test_required_documents_item_missing_name_returns_422`
  - `test_publication_links_reject_non_http_url`
  - `test_archiving_logs_archived_activity`
  - `test_status_change_logs_old_and_new`
- [ ] **Step 2:** Run `pytest tests/test_research.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement, following the jobs module's structure.
- [ ] **Step 4:** Run `pytest -v`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(research): add research opportunity API`

### Task 5: Reminders, notes, contacts and cascading deletes

Grouped because contact links, notes and reminders all share the same target check and the same delete behaviour.

**Branch:** `feature/contacts-reminders-notes-api`

**Files:**
- Create: `backend/app/modules/entities.py`, `backend/app/modules/contacts/*`, `backend/app/modules/notes/*`, `backend/app/modules/reminders/*`, migration
- Modify: `delete_job` and `delete_research` services
- Test: `backend/tests/test_contacts.py`, `backend/tests/test_notes.py`, `backend/tests/test_reminders.py`, `backend/tests/test_cascades.py`

**Interfaces:**
- Produces:
  - `assert_entity_owned(db, user, entity_type, entity_id) -> str`, returning the entity's label and raising `404` otherwise
  - `delete_dependents(db, user, entity_type, entity_id) -> None`, removing notes, reminders and contact links for jobs and research. For contacts it also removes links where `contact_id` matches.
  - Routes: as listed in the spec's API table, including `POST /contacts/{id}/links`, and `DELETE /contacts/{id}/links/{link_id}`.
  - `GET /contacts/{id}` returns the contact with `links: [{id, entity_type, entity_id, label}]`.
  - Reminder list filter `state`: `overdue`, `upcoming`, `completed`. Add a `due_within_days` filter, used by the header bell.

- [ ] **Step 1: Write failing tests**, named:
  - `test_contact_crud_and_filters`, and `test_contacts_isolated`
  - `test_link_contact_to_job_logs_contact_added_on_job`
  - `test_duplicate_link_returns_409`
  - `test_link_to_another_users_job_returns_404`
  - `test_filter_contacts_by_linked_entity_and_follow_up_due`
  - `test_note_crud_kinds_and_filters`, and `test_notes_isolated`
  - `test_note_on_another_users_job_returns_404`
  - `test_reminder_crud`, and `test_reminders_isolated`
  - `test_completing_reminder_sets_completed_at_and_reopening_clears_it`
  - `test_state_filters_overdue_upcoming_completed`
  - `test_reminder_due_at_without_offset_returns_422`
  - `test_reminder_related_to_another_users_record_returns_404`
  - `test_delete_job_removes_notes_reminders_links_keeps_contact_and_activity`
  - `test_delete_research_same_behaviour`
  - `test_delete_contact_removes_its_notes_reminders_links`
  - `test_deleted_item_activity_keeps_label`
- [ ] **Step 2:** Run the four test files. Expected: FAIL.
- [ ] **Step 3:** Implement. Use Pydantic's `AwareDatetime` for `due_at` and `interview_at`. **This also tightens Task 3's `interview_at`**, so add `test_interview_at_without_offset_returns_422` to `test_jobs.py`. Deletes and dependents share one transaction.
- [ ] **Step 4:** Run `pytest -v`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): add contacts, notes, reminders and cascading deletes`

### Task 6: Dashboard API

**Branch:** `feature/dashboard-api`

**Files:**
- Create: `backend/app/modules/dashboard/{schemas,service,router}.py`
- Test: `backend/tests/test_dashboard.py`

**Interfaces:**
- Produces:
  - `GET /dashboard/summary` returning `{total_jobs, total_research, in_progress, interviews_scheduled, offers, rejected, upcoming_deadlines, pending_follow_ups}`
  - `GET /dashboard/upcoming-deadlines` returning `[{kind, id, title, due, related_type, related_id}]` sorted by due date
  - `GET /dashboard/recent-activities`
  - `GET /dashboard/analytics` returning `{job_status: [{status, count}], research_status: [{status, count}], monthly: [{month: "YYYY-MM", jobs, research}]}`, always with 12 months, including zeros, ending in the current month

- [ ] **Step 1: Write failing tests** with fixed dates, using an injected `now`. Named:
  - `test_empty_account_returns_zeros_and_12_empty_months`
  - `test_each_summary_number_matches_spec_definition`, parametrized over the 8 statistics, with records just inside and outside each rule
  - `test_deadline_today_is_upcoming_and_day_15_is_not`
  - `test_inactive_records_do_not_count_as_upcoming_deadlines`
  - `test_completed_reminders_do_not_count`
  - `test_overdue_follow_ups_count_and_day_8_does_not`
  - `test_monthly_excludes_records_without_application_date`
  - `test_dashboard_excludes_other_users_records`
- [ ] **Step 2:** Run `pytest tests/test_dashboard.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement with aggregate SQL, not by loading rows into Python. Services take `now: datetime | None = None`, and date rules use `now.date()` in UTC. The API has no user time zone, so document in the code that "today" is the UTC date.
- [ ] **Step 4:** Run `pytest -v`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(dashboard): add summary, deadlines and analytics API`

### Task 7: Backend container and CI

**Branch:** `feature/backend-ci`

**Files:**
- Create: `backend/Dockerfile`, `.github/workflows/ci.yml`
- Modify: `docker-compose.yml` (adds `api`), `.env.example`

**Interfaces:**
- Produces: a container that runs `alembic upgrade head`, then `uvicorn` on `$PORT`, defaulting to 8000.

- [ ] **Step 1:** Write the Dockerfile (non-root user, Python 3.12 slim) and add `api` to Compose.
- [ ] **Step 2:** Run `docker compose up -d --build api && curl -s localhost:8000/health`. Expected: `{"status":"ok"}`. Also confirm `/docs` returns `200`.
- [ ] **Step 3:** Write the CI workflow, with a backend job (Postgres 16 service, ruff, mypy, pytest) and a secret-scanning job using gitleaks over the full history.
- [ ] **Step 4:** Push the branch and run `gh run watch`. Expected: both jobs pass.
- [ ] **Step 5: Commit** `ci: add backend container and GitHub Actions`

---

## Frontend

The frontend has no unit tests in the spec. Each task verifies with `npm run lint && npx tsc --noEmit && npm run build`, plus the browser checks listed, against the Compose stack. Task 12 adds the Playwright coverage.

### Task 8: Frontend foundation and auth pages

**Branch:** `feature/frontend-foundation`

**Files:**
- Create: `frontend/` (Next.js App Router, Tailwind, shadcn/ui), `frontend/next.config.ts`, `frontend/middleware.ts`
- Create: `frontend/lib/api.ts`, `frontend/lib/query.tsx`, `frontend/lib/types.ts`
- Create: `frontend/app/(auth)/login/page.tsx`, `frontend/app/(auth)/register/page.tsx`, `frontend/app/(app)/layout.tsx`
- Create: `frontend/components/app-shell.tsx`, `frontend/components/data-state.tsx`, `frontend/components/theme-toggle.tsx`

**Interfaces:**
- Produces:
  - `api<T>(path: string, init?: {method, body, query}) -> Promise<T>`, adding the CSRF header on mutations and throwing `ApiError {status, code, message, details}`
  - `<DataState query={...} skeleton={...} empty={...}>`, rendering loading, error-with-retry, empty and success states. All later pages use it.
  - `useCurrentUser()`
  - `<PageHeader>`
- Rewrites: `/api/v1/:path*` to `${API_URL}/api/v1/:path*`

- [ ] **Step 1:** Scaffold with the current stable Next.js, then add the libraries from the tech stack.
- [ ] **Step 2:** Implement the API client. A global TanStack Query error handler responds to any `401` by clearing the cache and redirecting to `/login?next=<path>`. This doesn't apply on auth pages, where a `401` is a wrong password. Queries don't retry `4xx` and retry network or `5xx` errors twice.
- [ ] **Step 3:** Implement login and register with Zod rules matching the backend (10 to 128 characters), showing server errors on the right fields. Validate `next` as a same-site path, so it can't redirect to another website.
- [ ] **Step 4:** Implement the app shell: sidebar with the 7 items, slide-out menu on mobile, user menu with logout, theme toggle. `middleware.ts` redirects when the cookie is absent. Add placeholder pages only for routes the sidebar links to, plus a not-found page. In `next.config.ts`, set the headers `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.
- [ ] **Step 5:** Verify in the browser:
  - Register, reach the shell, log out, log back in
  - Delete the cookie while on a page, trigger a request, and land on `/login?next=...`
  - Stop the API and see an error state with a working Retry
  - At 375px wide, the menu opens and there is no sideways page scroll
- [ ] **Step 6: Commit** `feat(frontend): add app shell, API client and auth pages`

### Task 9: Shared detail components and jobs UI

**Branch:** `feature/jobs-ui`

**Files:**
- Create: `frontend/lib/enums.ts` (labels and colours per status)
- Create: `frontend/components/kanban-board.tsx`, `frontend/components/status-badge.tsx`, `frontend/components/list-toolbar.tsx`, `frontend/components/pagination.tsx`
- Create: `frontend/components/entity/{notes-panel,activity-timeline,linked-contacts,reminders-panel}.tsx`
- Create: `frontend/app/(app)/jobs/page.tsx`, `frontend/app/(app)/jobs/[id]/page.tsx`, `frontend/components/jobs/job-form.tsx`

**Interfaces:**
- Produces, for reuse by Task 10:
  - `<KanbanBoard columns items onMove renderCard />`
  - `<ListToolbar filters />`, synced to URL search parameters
  - `<NotesPanel entityType entityId />`, `<ActivityTimeline entityType entityId />`, `<LinkedContacts entityType entityId />`, `<RemindersPanel relatedType relatedId />`

- [ ] **Step 1:** Implement the toolbar, pagination and table. Filters and view mode live in the URL, and search input is debounced by 300 ms. Tables become cards below `md`.
- [ ] **Step 2:** Implement the Kanban board with dnd-kit. A move updates the cache at once and rolls back with a toast on failure. Each card also has a status menu for keyboard and touch users. Kanban loads up to 100 items per request and shows a notice when more exist, directing users to the filters.
- [ ] **Step 3:** Implement the job form (dialog) and detail page with all the entity panels. Delete asks for confirmation and states that notes and reminders go too. Render stored URLs only if they start with `http`.
- [ ] **Step 4:** Verify in the browser:
  - Create, edit and delete a job
  - Filters survive a refresh
  - Drag a card and confirm it persists after a refresh
  - Block the `PATCH` request and confirm the card returns to its column
  - Add a note, link a contact and add a reminder from the detail page
  - Empty states appear on a new account
  - Check at 375px wide
- [ ] **Step 5: Commit** `feat(frontend): add job tracker with table, Kanban and detail views`

### Task 10: Research UI

**Branch:** `feature/research-ui`

**Files:**
- Create: `frontend/app/(app)/research/page.tsx`, `frontend/app/(app)/research/[id]/page.tsx`, `frontend/components/research/{research-form,document-checklist,publication-links}.tsx`

**Interfaces:**
- Consumes: all of Task 9's shared components.

- [ ] **Step 1:** Implement list, Kanban, form and detail, reusing Task 9's components.
- [ ] **Step 2:** Implement the document checklist (add, tick, remove, saving through `PATCH`), publication links and research interest tags.
- [ ] **Step 3:** Verify in the browser: full create, edit and delete; tick a document and refresh; archive and see the activity entry; check at 375px wide.
- [ ] **Step 4: Commit** `feat(frontend): add research opportunity tracker`

### Task 11: Contacts, reminders, dashboard, analytics and settings

**Branch:** `feature/remaining-pages`

**Files:**
- Create: `frontend/app/(app)/contacts/page.tsx`, `frontend/app/(app)/contacts/[id]/page.tsx`
- Create: `frontend/app/(app)/reminders/page.tsx`, `frontend/components/reminder-bell.tsx`
- Create: `frontend/app/(app)/dashboard/page.tsx`, `frontend/app/(app)/analytics/page.tsx`, `frontend/components/charts/{status-distribution,monthly-activity}.tsx`
- Create: `frontend/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `<DataState>`, `<ListToolbar>`, `<NotesPanel>`; dashboard endpoints from Task 6.

- [ ] **Step 1:** Implement contacts: list with filters, and detail with linked opportunities and communication history.
- [ ] **Step 2:** Implement reminders: overdue, upcoming and completed tabs, plus the header bell, showing incomplete reminders overdue or due within 3 days.
- [ ] **Step 3:** Implement the dashboard: welcome, 8 cards, both pipelines, deadlines, recent activity, quick-add buttons. Use the `dataviz` skill before writing charts. Mutations elsewhere invalidate dashboard queries.
- [ ] **Step 4:** Implement analytics and settings (profile and password).
- [ ] **Step 5:** Verify in the browser:
  - Compare each dashboard number against what was entered, including after changing a status
  - Completing a reminder clears it from the bell
  - Changing the password keeps this session
  - Dark mode has readable contrast
  - Check at 375px and 768px wide
- [ ] **Step 6: Commit** `feat(frontend): add contacts, reminders, dashboard, analytics and settings`

### Task 12: Full stack, Playwright and CI

**Branch:** `feature/e2e`

**Files:**
- Create: `frontend/Dockerfile`, `frontend/playwright.config.ts`, `frontend/e2e/main-journey.spec.ts`, `frontend/e2e/isolation.spec.ts`
- Modify: `docker-compose.yml` (adds `web`), `.github/workflows/ci.yml`

- [ ] **Step 1: Write failing tests:**
  - `main-journey.spec.ts`: register a unique user, add a job, change its status on the board, add a reminder, complete it, and assert the dashboard's totals changed. Runs at desktop and at a 375px mobile project.
  - `isolation.spec.ts`: user B opening user A's job URL sees "not found" and none of its data.
- [ ] **Step 2:** Add `web` to Compose. Run `docker compose up -d --build`, then `npx playwright test`. Fix what fails.
- [ ] **Step 3:** Extend CI: a frontend job (lint, type check, build) on every push and PR, and Playwright on PRs only. Set the CI trigger accordingly.
- [ ] **Step 4: Commit** `test(e2e): add Playwright journeys and full-stack Compose`
- [ ] **Step 5:** Open a PR for this branch so the Playwright job runs, and confirm it passes before merging. Bind it with the app's PR tools.

---

## Release

### Task 13: Documentation

**Branch:** `docs/release-docs`

**Files:**
- Create: `LICENSE` (MIT), `CONTRIBUTING.md`, `backend/scripts/seed_demo.py`, `docs/architecture.md`, `docs/database.md`, `docs/api.md`, `docs/demo-script.md`, `docs/screenshots/*`
- Modify: `README.md`, `.env.example`

- [ ] **Step 1:** Write `seed_demo.py`, which creates one demo account with invented data through the service layer. It takes the demo password from an environment variable, and refuses to run unless `DATABASE_URL` points to localhost or `--allow-remote` is passed. Run it locally and capture screenshots: dashboard, Kanban, research detail, mobile.
- [ ] **Step 2:** Write the docs. Use Mermaid for the architecture and ER diagrams. `docs/api.md` links to Swagger and records the conventions and the CSRF header. The demo script runs 2 minutes or less.
- [ ] **Step 3:** Follow the README from a fresh clone in a temporary directory and confirm `docker compose up` works with only `.env.example` copied.
- [ ] **Step 4:** Scan the full history for secrets: `git log -p | grep -iE 'password=|secret=|api[_-]?key=|postgres(ql)?://[^:]+:[^@]+@'`. Expected: only placeholder values.
- [ ] **Step 5: Commit** `docs: add README, architecture, API docs and screenshots`

### Task 14: Deployment

**Branch:** `main`, plus a config branch if files change.

**Files:**
- Create: `render.yaml`
- Modify: `frontend/next.config.ts` only if needed

The repo owner signs in to each service and enters all secrets. Agents do not enter credentials. Confirm each publish step with the owner first.

- [ ] **Step 1:** Add `render.yaml` and commit: `chore(deploy): add Render blueprint`.
- [ ] **Step 2:** Owner creates a Neon database and sets `DATABASE_URL` on Render, along with a generated `JWT_SECRET`, `COOKIE_SECURE=true` and `TRUST_PROXY=true`.
- [ ] **Step 3:** Deploy Render and confirm `/health` and `/docs`, and that migrations ran.
- [ ] **Step 4:** Owner imports the repo into Vercel with root `frontend` and `API_URL` set to the Render URL.
- [ ] **Step 5:** Verify on the public URL:
  - HTTPS, and the cookie is `Secure` and `HttpOnly`
  - The full journey, using `PLAYWRIGHT_BASE_URL` with a throwaway account
  - Two accounts can't see each other's records
  - The first request after Render sleeps eventually loads or shows Retry
  - Rate limiting responds with `429` through the proxy
- [ ] **Step 6:** Add the demo URL to the README and commit: `docs: add live demo link`. The video link follows once the owner records it.
- [ ] **Step 7:** Walk through the spec's 11 success criteria and report each one as passing, failing or waiting on the owner.
