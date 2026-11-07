# API

The backend is a FastAPI app. Interactive documentation is generated from the code:

- Swagger UI: `/docs` (<http://localhost:8000/docs> when running locally)
- OpenAPI schema: `/openapi.json`

Both stay enabled in production. This page covers what Swagger does not say: the conventions,
the CSRF header, the cookie and the limits.

## Conventions

- **Base path:** `/api/v1`. The one exception is `GET /health`, which returns `{"status": "ok"}`.
- **Format:** JSON requests and responses. IDs are UUIDs.
- **Authentication:** a session cookie. See below.
- **Dates:** date-only fields (`deadline`, `application_date`, `follow_up_date`,
  `next_follow_up_at`, `last_contacted_at`) are `YYYY-MM-DD`. Timestamps (`due_at`,
  `interview_at`) are ISO 8601 and **must include a UTC offset** such as `Z` or `+02:00`. A value
  without an offset is rejected with `422`, not guessed. Timestamps must also have a year between
  1900 and 2200.
- **Today:** the API has no user time zone, so `GET /dashboard/summary`,
  `GET /dashboard/upcoming-deadlines`, `GET /dashboard/overdue-research`,
  `GET /contacts?follow_up_due=true` and every project route that returns a project
  (`GET`, `POST` and `PATCH /projects`, and `GET /projects/{id}`) take an optional
  `today=YYYY-MM-DD` query parameter, the client's local date. It must be within one day of the UTC
  date, otherwise the response is `422`, and when omitted the UTC date is used. It applies to
  date-only fields only; reminders always compare exact instants. The app sends the browser's
  local date, so a deadline dated today stays on the dashboard all day for users west of UTC.
- **Text:** a NUL character (`\u0000`) in any text field or search term returns `422`, because
  PostgreSQL cannot store it.
- **Updates:** `PATCH` changes only the fields present in the body. Sending `null` clears an
  optional field. Required fields cannot be set to `null`.
- **Ownership:** every record belongs to one user. A record that does not exist and a record that
  belongs to someone else both return `404`.
- **Deletes:** `DELETE` returns `204` and is permanent. Deleting a job, research opportunity or
  contact also removes its notes, reminders and contact links. Deleting a research project also
  removes its submissions, milestones, notes and reminders.

### Lists

List endpoints accept these query parameters, plus the filters listed in the table below.

| Parameter | Meaning |
|---|---|
| `page` | Page number, starting at 1. Default 1. |
| `page_size` | Items per page. Default 20, maximum 100. |
| `sort` | A field name, with a leading `-` for descending, for example `-deadline`. Only an allowed list of fields is accepted, otherwise `422` with the allowed names in `details`. Empty values sort last. |
| `q` | Case-insensitive text search over the resource's main text fields. `%` and `_` match literally. |

The response is:

```json
{ "items": [], "total": 0, "page": 1, "page_size": 20 }
```

### Errors

Every error uses one shape:

```json
{ "error": { "code": "not_found", "message": "Resource not found", "details": null } }
```

| Status | `code` | When |
|---|---|---|
| 401 | `unauthorized` | No session, an expired or revoked session, or wrong login credentials. The login message is always the same, whichever part was wrong. |
| 403 | `forbidden` | A `POST`, `PATCH` or `DELETE` without the CSRF header. |
| 404 | `not_found` | The record does not exist or is not yours. |
| 405 | `method_not_allowed` | The method is not supported on that path. |
| 409 | `conflict` | Email already registered, or a contact already linked to a record. |
| 422 | `validation_error` | Invalid input. `details` is a list of `{loc, message, type}`. Messages from the app's own validators have no "Value error, " prefix. |
| 429 | `rate_limited` | Too many requests. |
| 500 | `internal_error` | An unexpected server error. |

### CSRF header

`POST`, `PATCH` and `DELETE` requests must send:

```
X-Requested-With: CareerLab
```

Without it the API returns `403 forbidden`. `GET` requests do not need it. The frontend's API
client adds the header for you.

**Swagger "Try it out":** the OpenAPI schema declares `X-Requested-With` on every `POST`, `PATCH`
and `DELETE` operation, prefilled with `CareerLab`, so Swagger UI sends it and mutations work. The
API still checks the raw request header, and a page on another site cannot send the header without
passing a CORS preflight, so this does not weaken the check.

The session is a cookie, not a token, so there is no "Authorize" button. To use Swagger:

1. Open `/docs` on the API host itself (<http://localhost:8000/docs> locally, the API's own URL
   when deployed), not on the web app's host.
2. Run `POST /auth/login` ("Try it out", then "Execute") with an account's email and password. The
   response sets the session cookie for that host.
3. Run any other operation. The browser sends the cookie with each request.

Locally, signing in to the app at <http://localhost:3000> also works for `GET` calls, because
browsers share cookies between ports on `localhost`. A cookie set on the web app's host is not
sent to a different API host, which is why the steps above sign in through Swagger itself.

### Session cookie

| Property | Value |
|---|---|
| Name | `careerlab_session` |
| Content | A signed JWT holding the user ID and the user's `token_version` |
| Flags | `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when `COOKIE_SECURE=true` |
| Lifetime | 7 days |

`POST /auth/register` and `POST /auth/login` set it. `POST /auth/logout` clears it. Changing the
password increments `token_version`, which signs out all other sessions, and sets a fresh cookie
for the current one.

### Rate limits

Limits are counted in memory per API process, per rolling minute, and answer `429`.

| Endpoint | Limit |
|---|---|
| `POST /auth/register` | 5 per client IP (set by `RATE_LIMIT_REGISTER_PER_MINUTE`), and 30 across all IPs (set by `RATE_LIMIT_REGISTER_GLOBAL_PER_MINUTE`). Only the end-to-end environment raises either |
| `POST /auth/login` | 10 per client IP, and 5 per email address |

The client IP is the connection's address, or the first `X-Forwarded-For` entry when
`TRUST_PROXY=true`, and only when that entry is a valid IP address (anything else falls back to
the connection's address). Counters reset when the API restarts and are not shared between
instances.

Each limiter keeps at most 10,000 keys. Once that is reached and no expired key can be dropped,
new keys share one overflow counter with the same limit, so memory stays bounded and limiting
continues.

Password hashing and verification (register, login, change password) also share a small number of
concurrent slots. When none frees up within about two seconds, the request is answered `429` with
the message "The server is busy".

## Routes

All paths are under `/api/v1` unless noted. Every route except `register`, `login`, `logout`
and `/health` needs a session.

| Method and path | Purpose | Notes |
|---|---|---|
| `GET /health` | Health check | Outside `/api/v1`, no session |
| `POST /auth/register` | Create an account and sign in | `201`. Password 10 to 128 characters. Emails are stored lowercase |
| `POST /auth/login` | Sign in | |
| `POST /auth/logout` | Sign out | `204` |
| `GET /auth/me` | Current user | |
| `PATCH /auth/me` | Edit name or email | |
| `POST /auth/change-password` | Change password | `204`. Wrong current password is `422` |
| `GET /jobs` | List jobs | Filters: `company`, `position`, `status`, `priority`, `job_type`, `employment_type`, `source`, `category`, `application_date_from`, `application_date_to`, `deadline_from`, `deadline_to`. `category` is `jobs` or `internships`: `internships` is `employment_type` `internship` or `co_op`, `jobs` is every other record including those with no type. `sort` also accepts `start_date` |
| `POST /jobs` | Create a job | `201`. Optional `employment_type` (adds `co_op`, `apprenticeship`, `freelance`, `graduate_program`), `source`, `start_date`, `end_date`, `pay_period`, `visa_sponsorship`, `academic_credit`. `end_date` before `start_date` is `422` |
| `GET /jobs/{id}` | Get a job | |
| `PATCH /jobs/{id}` | Update a job | `salary_min` above `salary_max` is `422`. `end_date` before `start_date` is `422`, checked against the stored other date when only one is sent |
| `DELETE /jobs/{id}` | Delete a job | `204` |
| `GET /research` | List research opportunities | Filters: `status`, `opportunity_type`, `funding_status`, `country`, `deadline_from`, `deadline_to` |
| `POST /research` | Create | `201` |
| `GET /research/{id}` | Get | |
| `PATCH /research/{id}` | Update | List fields are replaced as a whole |
| `DELETE /research/{id}` | Delete | `204` |
| `GET /projects` | List research projects (your own papers, theses and studies) | Filters: `stage`, `project_type`, `active`, `q` (title, topic, institution). `active=true` hides `published` and `paused` projects. `active=false` is **not** a filter and returns every project, the same as leaving it out. Sort: `created_at`, `updated_at`, `title`, `target_date`. Optional `today`. Each project has `milestones_total`, `milestones_done`, `submissions_total`, `next_deadline` and `has_overdue`. `has_overdue` is true when an open item (the same items the dashboard counts) is dated before `today` |
| `POST /projects` | Create | `201`. Optional `today` |
| `GET /projects/{id}` | Get | Optional `today` |
| `PATCH /projects/{id}` | Update, including `stage` | Optional `today` |
| `DELETE /projects/{id}` | Delete, with its submissions, milestones, notes and reminders | `204` |
| `GET /projects/{id}/submissions` | List the venues a project is sent to | Every submission, up to 100 |
| `POST /projects/{id}/submissions` | Add a submission | `201`. `abstract_deadline` after `paper_deadline` is `422`, checked against the stored other date when only one is sent. `venue_url` must be `http` or `https`. Optional `abstract_submitted_on` (a date): once it is set, the abstract deadline no longer counts as an open item, while the paper deadline still counts as long as the status is `planned` |
| `PATCH /projects/{id}/submissions/{submission_id}` | Update, including `status` | A submission of another project or user is `404`. `abstract_submitted_on` can be set, and cleared with `null`. The API never fills `submitted_on` when `status` changes; the client sends it |
| `DELETE /projects/{id}/submissions/{submission_id}` | Delete | `204` |
| `GET /projects/{id}/milestones` | List milestones | Due date order, undated last |
| `POST /projects/{id}/milestones` | Add a milestone | `201`. Adding, changing or deleting a submission or milestone also updates the project's `updated_at` |
| `PATCH /projects/{id}/milestones/{milestone_id}` | Update, or tick with `is_done` | `completed_at` is set when done and cleared when reopened |
| `DELETE /projects/{id}/milestones/{milestone_id}` | Delete | `204` |
| `GET /contacts` | List contacts | Filters: `contact_type`, `entity_type`, `entity_id`, `follow_up_due` |
| `POST /contacts` | Create | `201` |
| `GET /contacts/{id}` | Get, with linked records | |
| `PATCH /contacts/{id}` | Update | |
| `DELETE /contacts/{id}` | Delete | `204` |
| `POST /contacts/{id}/links` | Link a contact to a job or research opportunity | `201`. A repeat link is `409`. `project` is `422`, because contacts do not link to projects |
| `DELETE /contacts/{id}/links/{link_id}` | Remove a link | `204` |
| `GET /reminders` | List reminders | Filters: `state` (`overdue`, `upcoming`, `completed`), `related_type`, `related_id`, `due_within_days` |
| `POST /reminders` | Create | `201`. `related_type` and `related_id` go together |
| `PATCH /reminders/{id}` | Update, or complete with `is_completed` | |
| `DELETE /reminders/{id}` | Delete | `204` |
| `GET /notes` | List notes | Filters: `entity_type`, `entity_id`, `kind` |
| `POST /notes` | Create | `201` |
| `PATCH /notes/{id}` | Edit `kind` or `content` | |
| `DELETE /notes/{id}` | Delete | `204` |
| `GET /activity` | Activity history | Filters: `entity_type`, `entity_id`. Newest first |
| `GET /dashboard/summary` | The dashboard numbers, including `active_research_projects` | Optional `today` |
| `GET /dashboard/upcoming-deadlines` | Items due in the next 14 days. Includes the kinds `project_submission_deadline` and `project_milestone`, with `project_id` and `project_title` | Optional `today` |
| `GET /dashboard/overdue-research` | Open research project items dated before today, oldest first, at most 50 | Optional `today` |
| `GET /dashboard/recent-activities` | The 10 most recent activity rows | |
| `GET /dashboard/analytics` | Status counts and monthly counts for the last 12 months | |

Field names, enum values and response shapes for each route are in Swagger at `/docs`.

## Example

```bash
# Sign in and keep the cookie
curl -c cookies.txt -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -H 'X-Requested-With: CareerLab' \
  -d '{"email": "you@example.com", "password": "your-password"}'

# Create a job
curl -b cookies.txt -X POST http://localhost:8000/api/v1/jobs \
  -H 'Content-Type: application/json' \
  -H 'X-Requested-With: CareerLab' \
  -d '{"company_name": "Example Co", "position_title": "Analyst"}'

# List jobs with a filter and sort order (no CSRF header needed for GET)
curl -b cookies.txt 'http://localhost:8000/api/v1/jobs?status=applied&sort=-deadline'
```
