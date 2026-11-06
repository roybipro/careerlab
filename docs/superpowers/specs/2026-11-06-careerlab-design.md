# CareerLab MVP design

**Date:** 2026-11-06
**Status:** awaiting review

## 1. Goal

CareerLab gives students and early-career professionals one private workspace for
job applications, research opportunities, contacts, deadlines and reminders. It
replaces scattered spreadsheets, bookmarks and notes.

The MVP is a portfolio-quality product that also works for real use: secure,
tested, documented and publicly deployed.

### Success criteria

1. A user can register, log in, log out, edit their profile and change their password.
2. A user can create, view, edit and delete jobs, research opportunities, contacts,
   reminders and notes.
3. Statuses can be changed from forms and from the Kanban board.
4. Reminders can be created and completed, and overdue or due-soon items appear in
   the header bell and on the dashboard.
5. Dashboard numbers come from live database queries.
6. Search, filters, sorting and pagination work on every list.
7. No user can read, change or delete another user's records, and tests prove it.
8. The app works at desktop, tablet and mobile widths.
9. Backend tests pass in GitHub Actions.
10. The app is publicly deployed and Swagger docs are reachable.
11. The repo contains a README, LICENSE, CONTRIBUTING, `.env.example`, architecture
    and ER diagrams, API documentation, screenshots, and setup and Docker instructions.

### Out of scope

Job scraping, automatic applications, AI features, email sync, email reminders,
professor discovery, real-time collaboration, native apps, file uploads, calendar
view, soft deletes and account deletion.

## 2. Architecture

```
Browser → Next.js (Vercel) → /api/v1/* rewrite → FastAPI (Render) → PostgreSQL (Neon)
```

The repo is a monorepo with `backend/`, `frontend/`, `docs/` and `docker-compose.yml`.
Compose runs all three services locally. The backend owns all business logic,
authorization and validation. The frontend only calls the documented REST API.

### Backend

- Python 3.12, FastAPI, SQLAlchemy 2, Pydantic 2, Alembic.
- Layers are `routers → services → models`, with one module per domain: `auth`,
  `jobs`, `research`, `contacts`, `reminders`, `notes`, `activity`, `dashboard`.
- Every service function takes the current user and filters by `user_id`.
- Routers contain no queries.

### Frontend

- Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query,
  React Hook Form, Zod, Recharts.
- One typed API client handles all requests, errors and the CSRF header.
- List filters live in the URL, so views survive a refresh and can be linked.

## 3. Authentication and security

- **Passwords:** hashed with Argon2. Length must be 10 to 128 characters.
- **Emails:** normalized to lowercase and unique. Registering a used email returns `409`.
- **Sessions:** a signed JWT in an `HttpOnly`, `SameSite=Lax` cookie, `Secure` in
  production, expiring after 7 days.
- **Revocation:** tokens carry the user's `token_version`, and changing a password
  increments it, which signs out other devices. Logout clears the cookie.
- **CSRF:** `POST`, `PATCH` and `DELETE` requests must include `X-Requested-With: CareerLab`.
- **CORS:** not needed in production because the proxy keeps everything on one domain.
  Local development allows only the configured frontend origin.
- **Rate limits:** in memory, which suits the single API instance.
  - Register: 5 per minute per client IP.
  - Login: 10 per minute per client IP, and 5 per minute per email address.
  - The email limit still protects accounts if forwarded client IPs turn out to be
    unreliable behind the proxy.
- **Login failures:** always the same generic message.
- **Ownership:** a record that doesn't exist or belongs to someone else returns `404`.
- **Secrets:** environment variables only. `.env` files are ignored by git, and
  `.env.example` documents each variable with no real values.
- **Search input:** `%` and `_` are escaped before `ILIKE` matching, and all SQL is
  parameterized.

## 4. Data model

All tables use a UUID primary key. Every user-owned table has `user_id` as a foreign
key to `users` with `ON DELETE CASCADE`. Main tables have `created_at` and `updated_at`.

### users

`full_name`, `email`, `password_hash`, `token_version`

### job_applications

| Field | Type | Notes |
|---|---|---|
| `company_name`, `position_title` | text | required |
| `company_website`, `company_logo_url`, `job_url` | text | optional URLs |
| `job_description`, `location`, `notes` | text | optional |
| `job_type` | enum | `on_site`, `remote`, `hybrid` |
| `employment_type` | enum | `full_time`, `part_time`, `internship`, `contract`, `temporary` |
| `salary_min`, `salary_max` | integer | optional, min ≤ max enforced by API and `CHECK` |
| `salary_currency` | text | optional |
| `status` | enum | `wishlist`, `preparing`, `applied`, `assessment`, `interview`, `offer`, `rejected`, `withdrawn`; default `wishlist` |
| `priority` | enum | `low`, `medium`, `high`; default `medium` |
| `resume_version`, `cover_letter_ref` | text | optional; a name, link or text reference |
| `application_date`, `deadline`, `follow_up_date` | date | optional |
| `interview_at` | timestamptz | optional |

The PRD lists "job type" and "employment type" without defining them. Here `job_type`
is the work arrangement and `employment_type` is the contract type. `location` is
free text for the place.

### research_opportunities

| Field | Type | Notes |
|---|---|---|
| `title`, `organization` | text | required |
| `opportunity_type` | enum | `research_assistant`, `research_internship`, `graduate_research_program`, `fully_funded_phd`, `masters_scholarship`, `fellowship`, `research_collaboration`, `visiting_researcher` |
| `country`, `department`, `laboratory`, `research_area` | text | optional |
| `professor_name`, `professor_email`, `professor_website` | text | optional |
| `description`, `eligibility`, `language_test_requirements`, `notes` | text | optional; IELTS and GRE go in `language_test_requirements` |
| `website`, `application_url` | text | optional URLs |
| `funding_status` | enum | `fully_funded`, `partially_funded`, `self_funded`, `unknown`; default `unknown` |
| `funding_amount` | text | optional; free text because amounts vary, such as "€2,000/month" |
| `research_interests` | JSON | list of strings |
| `publication_links` | JSON | list of `{title, url}` |
| `required_documents` | JSON | checklist of `{name, done}` |
| `status` | enum | `discovered`, `interested`, `contacted_professor`, `preparing_documents`, `applied`, `interview`, `accepted`, `rejected`, `archived`; default `discovered` |
| `application_date`, `deadline` | date | optional |

### contacts

`name` (required), `email`, `organization`, `position`, `contact_type` (`recruiter`,
`professor`, `researcher`, `hiring_manager`, `university_representative`, `other`),
`linkedin_url`, `website`, `last_contacted_at` (date), `next_follow_up_at` (date), `notes`.

### contact_links

`user_id`, `contact_id` (foreign key), `entity_type` (`job`, `research`), `entity_id`.
Unique on `(contact_id, entity_type, entity_id)`.

### reminders

`title` (required), `description`, `due_at` (timestamptz, required), `related_type`
(`job`, `research`, `contact`, or null), `related_id`, `is_completed`, `completed_at`.

### notes

`entity_type` (`job`, `research`, `contact`), `entity_id`, `kind` (`note`,
`interview_feedback`, `communication`), `content`.

### activity_logs

`entity_type`, `entity_id`, `action`, `metadata` (JSON), `created_at`. The table is
append-only. `metadata` stores the item's name so history stays readable after the
item is deleted.

### Rules

- **Polymorphic links:** `entity_id`, `related_id` and `contact_links.entity_id` can't
  use foreign keys. The service layer checks that the target exists and belongs to the
  user, and returns `404` if not.
- **Deletes are permanent.** Deleting a job, research opportunity or contact removes
  its notes, reminders and contact links in the same transaction. A linked contact
  survives when its job or opportunity is deleted. Activity logs are kept.
- **Time zones:** `date` fields are stored as dates with no conversion. Timestamps are
  stored in UTC and displayed in the browser's time zone.
- **Indexes:** `(user_id, status)`, `(user_id, deadline)` and `(user_id, created_at)` on
  jobs and research. `(user_id, due_at, is_completed)` on reminders.
  `(user_id, entity_type, entity_id)` on notes, activity and contact links.
  `(user_id, next_follow_up_at)` on contacts.

## 5. API

The base path is `/api/v1`. The PRD's routes are kept, and the additions are marked below.

| Area | Routes |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/logout`; `GET /auth/me`; added: `PATCH /auth/me`, `POST /auth/change-password` |
| Dashboard | `GET /dashboard/summary`, `/recent-activities`, `/upcoming-deadlines`, `/analytics` |
| Jobs | `GET`, `POST /jobs`; `GET`, `PATCH`, `DELETE /jobs/{id}` |
| Research | `GET`, `POST /research`; `GET`, `PATCH`, `DELETE /research/{id}` |
| Contacts | `GET`, `POST /contacts`; `GET`, `PATCH`, `DELETE /contacts/{id}`; added: `POST /contacts/{id}/links`, `DELETE /contacts/{id}/links/{link_id}` |
| Reminders | `GET`, `POST /reminders`; `PATCH`, `DELETE /reminders/{id}` |
| Notes | `GET`, `POST /notes`; `PATCH`, `DELETE /notes/{id}` |
| Added | `GET /activity`, filterable by entity, for detail pages; `GET /health`, outside the versioned path |

**Lists** accept `page`, `page_size` (default 20, maximum 100), `sort` (such as
`-deadline`, checked against an allowlist), `q` and resource filters. They return
`{items, total, page, page_size}`.

- **Jobs filters:** company, position, status, priority, job type, application date
  range, deadline range.
- **Research filters:** status, opportunity type, funding status, country, deadline range.
- **Contacts filters:** contact type, linked entity, follow-up due.
- **Reminders filters:** `state` (`overdue`, `upcoming`, `completed`), related entity.
- **Notes filters:** entity, kind.

**Errors** always use `{"error": {"code", "message", "details"}}`, with `401`, `403`
(missing CSRF header), `404`, `409`, `422` and `429`.

**Docs:** Swagger at `/docs` and OpenAPI at `/openapi.json` stay enabled in production.

### Activity events

Services write these in the same transaction as the change: `created`,
`status_changed` (with old and new values), `deadline_updated`, `interview_scheduled`,
`contact_added`, `archived`, `deleted`.

### Dashboard definitions

| Statistic | Definition |
|---|---|
| Total job applications | All of the user's jobs |
| Total research opportunities | All of the user's opportunities |
| Applications in progress | Jobs in `preparing`, `applied`, `assessment` or `interview` |
| Interviews scheduled | Jobs with `interview_at` in the future |
| Offers received | Jobs in `offer` plus research in `accepted` |
| Rejected applications | Jobs and research in `rejected` |
| Upcoming deadlines | Items due in the next 14 days: deadlines on active jobs and research, plus incomplete reminders |
| Pending follow-ups | Job `follow_up_date` and contact `next_follow_up_at` that are overdue or due in the next 7 days |

"Active" means not in `offer`, `rejected` or `withdrawn` for jobs, and not in
`accepted`, `rejected` or `archived` for research.

**Analytics:** status counts for jobs and research, and monthly counts over the last
12 months based on `application_date`. Records with no application date aren't counted
in the monthly chart.

**Reminder alerts:** the header bell shows incomplete reminders that are overdue or
due in the next 3 days. There are no background jobs, so alerts are calculated when
requested.

## 6. Frontend

**Sidebar:** Dashboard, Job Applications, Research Opportunities, Contacts, Reminders,
Analytics, Settings.

- **Auth pages:** login and register. Signed-out users are redirected to login.
- **Dashboard:** welcome message, 8 summary cards, job and research pipelines, upcoming
  deadlines, recent activity, quick-add buttons.
- **Jobs and research lists:** table and Kanban views, search, filters, pagination.
  Dragging a card updates the status immediately and rolls back with an error message
  if the save fails. Kanban also has a keyboard-accessible status menu on each card.
- **Detail pages:** all fields, notes by kind, activity timeline, linked contacts and
  reminders. Research pages add the document checklist and publication links.
- **Contacts:** list, detail with linked opportunities and communication history.
- **Reminders:** overdue, upcoming and completed tabs, with a complete action.
- **Analytics:** status distribution and monthly activity charts with Recharts.
- **Settings:** edit profile and change password.

**Responsive behaviour:** the sidebar becomes a slide-out menu on mobile, tables become
cards, and Kanban scrolls sideways.

**States:** every data view has a loading skeleton, a useful empty state, and an error
state with retry.

**Visual style:** neutral background, clear type hierarchy, subtle borders, minimal
shadows, accessible contrast. Dark mode is included, and is the first thing to cut if
time runs short.

## 7. Testing

- **Pytest against real PostgreSQL**, not SQLite, so enums, JSON and constraints behave
  as in production. Covers auth, CRUD, filters, pagination, dashboard numbers, cascading
  deletes, activity events and rate limits.
- **Isolation tests:** for every resource, user B gets `404` when reading, updating or
  deleting user A's record, and can't attach notes, reminders or links to it.
- **Playwright:** one main journey (register, add a job, move it on the board, complete
  a reminder, see the dashboard update), plus the same smoke check at mobile width.
- **GitHub Actions:** lint, type checks, backend tests with a Postgres service and the
  frontend build on every push and PR. Playwright also runs on PRs.

## 8. Delivery

- **Repo:** public at `github.com/roybipro/careerlab`.
- **Git:** docs may go directly to `main`. Each feature gets a `feature/*` branch, pushed
  as steps finish and merged to `main` once tests pass. Commit messages use Conventional
  Commits.
- **Secrets:** checked before each push, because the repo is public from the start.
- **Local:** `docker compose up` runs the frontend, API and Postgres. Docker Desktop has
  to be running.
- **Neon:** the production database.
- **Render:** the API, built from its Dockerfile. `alembic upgrade head` runs on each deploy.
- **Vercel:** the frontend, with rewrites pointing at the Render URL.
- **Account steps:** the repo owner signs in to Neon, Render and Vercel and enters
  secrets on those sites.
- **Demo video:** recorded by the repo owner from a provided script. Screenshots are
  captured during verification.

## 9. Known limits

- Render's free tier may sleep when idle, so the first request after a pause can be slow.
- Rate limit counters reset when the API restarts, and only work with a single instance.
- A stolen session cookie stays valid until it expires after 7 days or the password changes.
- Open registration has no email verification, so emails aren't confirmed as real.
