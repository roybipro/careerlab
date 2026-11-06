# Research Projects design

**Date:** 2026-11-06
**Status:** awaiting review
**Extends:** `2026-11-06-careerlab-design.md`. Its global rules apply here: ownership, error
format, list conventions, CSRF, date handling and testing.

## 1. Goal

Let a user track their own research, whether personal or for university, from first idea to
publication. This includes the conferences or journals they plan to submit to, the deadlines,
what happened to each submission, and the work left to do.

This is separate from Research Opportunities, which tracks positions and programs a user applies
to. That section does not change.

### Success criteria

1. A user can create, view, edit and delete research projects, submissions and milestones.
2. A project's stage can be changed from a form and from a Kanban board.
3. One project can hold several submissions, so a rejected paper can go to another venue.
4. Milestones can be ticked off, and the project shows its progress.
5. Upcoming and overdue submission deadlines and milestones appear on the dashboard.
6. Search, filters, sorting and pagination work on the project list.
7. No user can read, change or delete another user's projects, submissions or milestones, and
   tests prove it.
8. The screens work at desktop, tablet and phone widths, in light and dark modes.

### Out of scope

Supervisors and co-authors, links and reference lists, file uploads, and fetching conference dates
automatically.

## 2. Data model

All tables use a UUID primary key and `created_at` and `updated_at`. `user_id` is a foreign key to
`users` with `ON DELETE CASCADE`. All dates are plain dates with no time zone conversion.

### research_projects

| Field | Type | Notes |
|---|---|---|
| `title` | text | required |
| `project_type` | enum | `personal`, `university_course`, `thesis`, `research_group`, `other`; default `personal` |
| `stage` | enum | `idea`, `literature_review`, `experiments`, `writing`, `submitting`, `published`, `paused`; default `idea` |
| `topic`, `description`, `institution`, `notes` | text | optional; `institution` holds the university or course name |
| `target_date` | date | optional target completion date |

### project_submissions

| Field | Type | Notes |
|---|---|---|
| `project_id` | foreign key | to `research_projects`, `ON DELETE CASCADE` |
| `venue_name` | text | required |
| `venue_type` | enum | `conference`, `journal`, `workshop`, `other`; default `conference` |
| `venue_url` | text | optional, `http` or `https` only |
| `abstract_deadline`, `paper_deadline`, `notification_date`, `submitted_on` | date | optional |
| `status` | enum | `planned`, `submitted`, `under_review`, `revisions_requested`, `accepted`, `rejected`, `withdrawn`; default `planned` |
| `feedback` | text | optional reviewer comments |

`abstract_deadline` must not be after `paper_deadline` when both are set. This is enforced by the
API, using stored values merged with the patch, and by a `CHECK`.

### project_milestones

| Field | Type | Notes |
|---|---|---|
| `project_id` | foreign key | to `research_projects`, `ON DELETE CASCADE` |
| `title` | text | required |
| `due_date` | date | optional |
| `is_done` | boolean | default false |
| `completed_at` | timestamptz | set when done, cleared when reopened |

Milestones are listed by due date with undated ones last, and then by creation time.

### Links to existing features

- Add `project` to the entity types used by notes, reminders and activity logs. No table changes
  are needed unless a `CHECK` restricts the value, in which case a migration widens it.
- Contact links do not gain `project`, because people are out of scope. The contact link API must
  reject `project` with `422`.
- Deleting a project removes its submissions and milestones through the foreign keys, and its notes
  and reminders through the existing dependents logic, in one transaction. Activity logs stay.

### Indexes

`(user_id, stage)`, `(user_id, created_at)`, `(user_id, target_date)` on projects.
`(user_id, project_id)`, `(user_id, status, paper_deadline)`, `(user_id, status, abstract_deadline)`
on submissions. `(user_id, project_id)`, `(user_id, is_done, due_date)` on milestones.

The migration only adds tables and indexes and widens constraints, so existing rows do not change.

## 3. API

Base path `/api/v1`. All routes need a session and follow the list, error and CSRF conventions.

| Area | Routes |
|---|---|
| Projects | `GET`, `POST /projects`; `GET`, `PATCH`, `DELETE /projects/{id}` |
| Submissions | `GET`, `POST /projects/{id}/submissions`; `PATCH`, `DELETE /projects/{id}/submissions/{submission_id}` |
| Milestones | `GET`, `POST /projects/{id}/milestones`; `PATCH`, `DELETE /projects/{id}/milestones/{milestone_id}` |
| Dashboard | Added: `GET /dashboard/overdue-research`. Changed: `summary`, `upcoming-deadlines` |

- A submission or milestone id that belongs to another project or user returns `404`.
- **Project list filters:** `stage`, `project_type`, `active` and `q`, which matches title, topic and
  institution. `active=true` means a stage other than `published` or `paused`.
- **Project sort fields:** `created_at`, `updated_at`, `title`, `target_date`.
- **Project responses** include `milestones_total`, `milestones_done`, `submissions_total` and
  `next_deadline`, computed with SQL, without loading every row for each project on a list page.
  `next_deadline` is the earliest open item that is today or later, using the definitions below.
- **Sub-lists** return every record for one project, up to the standard page size cap of 100.

### Activity events

Written in the same transaction as the change: `created`, `stage_changed` (old and new),
`deleted`, `submission_added`, `submission_status_changed` (venue, old and new),
`milestone_completed`. Labels are stored so history stays readable after deletes.

### Dashboard definitions

**Open research items:**
- A **submission deadline** is the `abstract_deadline` or `paper_deadline` of a submission in
  `planned`. Each date counts as its own item. Once a submission leaves `planned`, its deadlines no
  longer count.
- A **milestone** is one with a `due_date` and `is_done` false.
- Items count only when the parent project's stage is not `published` or `paused`.

**Changes to existing definitions:**
- **Upcoming deadlines** also counts open research items due from today through today + 14
  inclusive. The summary number and `/dashboard/upcoming-deadlines` must keep returning the same set.
- `upcoming-deadlines` gains the kinds `project_submission_deadline` and `project_milestone`, with
  the project id so the row can link to its page.
- `today` follows the existing rule: the client's local date, validated within a day of UTC.

**New:**
- `active_research_projects` is added to `summary`: projects whose stage is not `published` or `paused`.
- `/dashboard/overdue-research` returns open research items dated before today, oldest first,
  capped at 50. The Overdue section shows them alongside overdue reminders.

## 4. Frontend

- **Sidebar:** a **Research Projects** item with its own icon, next to Research Opportunities.
- **List:** table and Kanban views by stage, using the shared toolbar, with search, type and stage
  filters, sorting, an All / Active switch and pagination. Cards and rows show the type, milestone
  progress and next deadline. Moving a card rolls back with an error message if the save fails, and
  each card has a keyboard status menu.
- **Project form:** title first and the rest in the existing collapsible sections, as on the job form.
- **Project page:** details, then Submissions, Milestones, Notes, Reminders and Activity, reusing
  the shared panels and the detail page scaffolding.
- **Submissions panel:** one row per venue with its status, deadlines and how soon they're due.
  Adding or editing uses a dialog with the feedback field, and deleting asks for confirmation.
- **Milestones panel:** a checklist with due dates, inline add, edit and delete, and an "N of M done"
  progress bar. A failed save reverts and shows an error. Overdue items stand out in text and colour.
- **Dashboard:** a compact Active research projects card, with research items in Upcoming deadlines
  and Overdue, each labelled with its kind and project and linking to the project page.
- **Empty states** explain what a research project is and offer to create the first one.
- **Style:** the existing Crisp cobalt tokens. Each stage and submission status gets a colour, an
  icon and a label, so meaning never relies on colour alone.

Selecting a filter value not in the allowed options behaves like the existing lists: it is ignored.

## 5. Testing

- **Backend, against real PostgreSQL:** CRUD, defaults, invalid enums, the deadline order rule on
  create and on partial `PATCH`, filters, sorting, pagination, computed fields, activity events,
  cascading deletes, and every dashboard boundary: day 0, 14 and 15, a project paused or published,
  a submission leaving `planned`, and a done milestone.
- **Isolation:** user B gets `404` on every project, submission and milestone route for user A's
  records, and can't attach notes or reminders to user A's projects. Dashboard numbers exclude them.
- **Playwright:** create a project, add a submission and a milestone, tick the milestone, see the
  progress change, move the project on the board, see the deadline on the dashboard, and delete it.
  Run at desktop and at 375px.
- **Docs:** update the README, `docs/api.md`, `docs/database.md`, the main spec's dashboard
  definitions, and the demo seed data, using fictional names only.

## 6. Delivery

Feature branches and PRs as before, with review after each task and the Playwright job passing
before merge. Merging runs the migration on the live database. The demo seed stays local.
