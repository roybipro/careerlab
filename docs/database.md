# Database

PostgreSQL 16, managed with Alembic migrations in `backend/alembic/versions/`. Models are in
`backend/app/modules/*/models.py`.

## Conventions

- Every table uses a UUID primary key.
- Every user-owned table has `user_id`, a foreign key to `users` with `ON DELETE CASCADE`.
- Main tables have `created_at` and `updated_at` (timestamps with time zone, stored in UTC).
- Enums are stored as plain text, with `CHECK` constraints added in the migrations.
- `date` fields (deadlines, application dates) are stored as dates with no time zone conversion.
- Deletes are permanent. Deleting a job, research opportunity or contact removes its notes,
  reminders and contact links in the same transaction. Activity logs are kept.

## ER diagram

Solid lines are real foreign keys. Dotted lines are polymorphic links: the row stores a type and
an id, and there is **no foreign key** because the target can be in one of several tables. The
service layer checks that the target exists and belongs to the user, and returns `404` if not.

```mermaid
erDiagram
    users ||--o{ job_applications : owns
    users ||--o{ research_opportunities : owns
    users ||--o{ contacts : owns
    users ||--o{ contact_links : owns
    users ||--o{ reminders : owns
    users ||--o{ notes : owns
    users ||--o{ activity_logs : owns
    contacts ||--o{ contact_links : "contact_id (FK)"

    contact_links }o..o| job_applications : "entity_id, entity_type=job (no FK)"
    contact_links }o..o| research_opportunities : "entity_id, entity_type=research (no FK)"
    notes }o..o| job_applications : "entity_id, entity_type=job (no FK)"
    notes }o..o| research_opportunities : "entity_id, entity_type=research (no FK)"
    notes }o..o| contacts : "entity_id, entity_type=contact (no FK)"
    reminders }o..o| job_applications : "related_id, related_type=job (no FK)"
    reminders }o..o| research_opportunities : "related_id, related_type=research (no FK)"
    reminders }o..o| contacts : "related_id, related_type=contact (no FK)"
    activity_logs }o..o| job_applications : "entity_id (no FK, kept after delete)"
    activity_logs }o..o| research_opportunities : "entity_id (no FK, kept after delete)"
    activity_logs }o..o| contacts : "entity_id (no FK, kept after delete)"

    users {
        uuid id PK
        string full_name
        string email UK
        string password_hash
        int token_version
        timestamptz created_at
        timestamptz updated_at
    }
    job_applications {
        uuid id PK
        uuid user_id FK
        string company_name
        string position_title
        string company_website
        string company_logo_url
        string job_url
        text job_description
        string location
        text notes
        string job_type
        string employment_type
        int salary_min
        int salary_max
        string salary_currency
        string status
        string priority
        string resume_version
        text cover_letter_ref
        date application_date
        date deadline
        date follow_up_date
        timestamptz interview_at
        timestamptz created_at
        timestamptz updated_at
    }
    research_opportunities {
        uuid id PK
        uuid user_id FK
        string title
        string organization
        string opportunity_type
        string country
        string department
        string laboratory
        string research_area
        string professor_name
        string professor_email
        string professor_website
        text description
        text eligibility
        text language_test_requirements
        text notes
        string website
        string application_url
        string funding_status
        string funding_amount
        jsonb research_interests
        jsonb publication_links
        jsonb required_documents
        string status
        date application_date
        date deadline
        timestamptz created_at
        timestamptz updated_at
    }
    contacts {
        uuid id PK
        uuid user_id FK
        string name
        string email
        string organization
        string position
        string contact_type
        string linkedin_url
        string website
        date last_contacted_at
        date next_follow_up_at
        text notes
        timestamptz created_at
        timestamptz updated_at
    }
    contact_links {
        uuid id PK
        uuid user_id FK
        uuid contact_id FK
        string entity_type
        uuid entity_id
    }
    reminders {
        uuid id PK
        uuid user_id FK
        string title
        text description
        timestamptz due_at
        string related_type
        uuid related_id
        bool is_completed
        timestamptz completed_at
        timestamptz created_at
        timestamptz updated_at
    }
    notes {
        uuid id PK
        uuid user_id FK
        string entity_type
        uuid entity_id
        string kind
        text content
        timestamptz created_at
        timestamptz updated_at
    }
    activity_logs {
        uuid id PK
        uuid user_id FK
        string entity_type
        uuid entity_id
        string action
        jsonb metadata
        timestamptz created_at
    }
```

## Tables

### users

Name, unique lowercase email, Argon2 hash and `token_version`. Changing the password increments
`token_version`, which invalidates existing session tokens.

### job_applications

- `status`: `wishlist` (default), `preparing`, `applied`, `assessment`, `interview`, `offer`,
  `rejected`, `withdrawn`.
- `priority`: `low`, `medium` (default), `high`.
- `job_type` is the work arrangement (`on_site`, `remote`, `hybrid`). `employment_type` is the
  contract (`full_time`, `part_time`, `internship`, `contract`, `temporary`).
- A `CHECK` constraint requires `salary_min <= salary_max` when both are set.

### research_opportunities

- `status`: `discovered` (default), `interested`, `contacted_professor`, `preparing_documents`,
  `applied`, `interview`, `accepted`, `rejected`, `archived`.
- `funding_status`: `fully_funded`, `partially_funded`, `self_funded`, `unknown` (default).
- `opportunity_type`: `research_assistant`, `research_internship`, `graduate_research_program`,
  `fully_funded_phd`, `masters_scholarship`, `fellowship`, `research_collaboration`,
  `visiting_researcher`.
- `research_interests` is a list of strings, `publication_links` a list of `{title, url}` and
  `required_documents` a checklist of `{name, done}`, all stored as JSONB.

### contacts and contact_links

A contact can be linked to any number of jobs and research opportunities. A contact survives when
a linked job or opportunity is deleted, and only the link row is removed. `contact_links` is unique
on `(contact_id, entity_type, entity_id)`. `entity_type` is `job` or `research`.

### reminders

`due_at` is required and must include a UTC offset. `related_type` and `related_id` are either both
set or both null (a `CHECK` constraint). A reminder due right now counts as upcoming, not overdue.

### notes

`entity_type` is `job`, `research` or `contact`. `kind` is `note` (default), `interview_feedback`
or `communication`. A note stays on the record it was written on.

### activity_logs

Append-only history written by the services in the same transaction as the change. `action` is one
of `created`, `status_changed`, `deadline_updated`, `interview_scheduled`, `contact_added`,
`archived` or `deleted`. `metadata` stores the item's label, and old and new values for status and
deadline changes, so history stays readable after the item is deleted. Timestamps use
`clock_timestamp()` so events written in one transaction keep their order.

## Indexes

| Table | Index |
|---|---|
| `job_applications`, `research_opportunities` | `(user_id, status)`, `(user_id, deadline)`, `(user_id, created_at)` |
| `reminders` | `(user_id, due_at, is_completed)` |
| `notes`, `activity_logs`, `contact_links` | `(user_id, entity_type, entity_id)` |
| `activity_logs` | `(user_id, created_at)` |
| `contacts` | `(user_id, next_follow_up_at)` |

## Migrations

```bash
cd backend
alembic upgrade head       # apply every migration
alembic current            # show the applied revision
```

The Docker image runs `alembic upgrade head` on every start.
