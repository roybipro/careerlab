# Research Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user track their own research projects from idea to publication, including conference or journal submissions, deadlines and milestones.

**Architecture:** One new backend module, `modules/projects`, following the jobs and research structure (`routers → services → models`), with `project` added to the shared entity types so notes, reminders and activity work on it. The dashboard service gains research items. The frontend reuses the shared list, Kanban and detail components.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, PostgreSQL, pytest; Next.js 16, TanStack Query, React Hook Form, Zod, dnd-kit, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-research-projects-design.md`. Field lists, enums, routes, filters and dashboard definitions live there and are not repeated here. Implementers read both documents, and follow `frontend/AGENTS.md` for the frontend.

## Global Constraints

- Base path `/api/v1`. Errors are `{"error": {"code", "message", "details"}}`, whose `details` items use `{"loc", "message", "type"}`.
- Lists accept `page`, `page_size` (default 20, maximum 100), `sort`, `q`, and return `{items, total, page, page_size}`.
- Every service function takes the current user and filters by `user_id`. A missing or foreign record returns `404`. Routers contain no queries and apply `require_csrf`.
- Patches use `exclude_unset`: `null` clears an optional field and returns `422` on a required one.
- Dates are plain dates with no time zone conversion. "Today" on the dashboard follows the existing `today` query parameter, validated within a day of UTC.
- Stored URLs accept only `http` and `https`, using the shared `HttpUrl`. Search uses the shared `contains`.
- Frontend: Crisp cobalt tokens, no hard-coded colours except where the theme already does; status never by colour alone; controls at least 40px on phones; no new dependencies.
- Fictional names only in seed data and tests. No real credentials. The repo is public.
- Migrations only add tables, indexes and widen constraints, with a working downgrade. They run automatically on the live database when merged.
- **Git flow:** one branch per task from up-to-date `main`, unless a task says otherwise. Push after each commit. Do not merge or open a PR: the controller does that after review. Commit messages use Conventional Commits.

## Review Focus

Each item has a test in the task that owns the code.

1. A `PATCH` setting only `abstract_deadline` after the stored `paper_deadline` returns `422`, and clearing either date succeeds. (Task 2)
2. Using a real submission or milestone id under the wrong project path, even one owned by the same user, returns `404` and changes nothing. (Task 2)
3. Ticking a milestone twice keeps its first `completed_at` and logs one `milestone_completed`; reopening clears it, and ticking again logs a new one. (Task 2)
4. After a project is paused, its overdue and upcoming items disappear from the dashboard, and they return when it's resumed. (Task 3)
5. Deleting a project leaves no reminder for it in the bell or dashboard, and its history stays readable. (Task 1)

---

### Task 1: Projects API and migration

**Branch:** `feature/projects-api`

**Files:**
- Create: `backend/app/modules/projects/{__init__,models,schemas,service,router}.py`, `backend/alembic/versions/0006_add_research_projects.py`
- Modify: `backend/app/modules/entity_types.py`, `backend/app/modules/entities.py`, `backend/app/modules/activity/router.py`, `backend/app/main.py`
- Test: `backend/tests/test_projects.py`, `backend/tests/test_migration_projects.py`

**Interfaces:**
- Consumes: `paginate`, `ListParams`, `contains`, `HttpUrl`, `Name`, `str_enum`, `log_activity`, `assert_entity_owned`, `delete_dependents`, `assert_isolated`.
- Produces:
  - Models `ResearchProject`, `ProjectSubmission`, `ProjectMilestone`. All three tables exist from this migration, so Task 2 needs no migration.
  - `EntityType.project = "project"`. `LinkableType` is unchanged.
  - `projects.service`: `list_projects`, `get_project(db, user, id) -> ResearchProject`, `create_project`, `update_project`, `delete_project`.
  - `ProjectOut` with `milestones_total`, `milestones_done`, `submissions_total`, `next_deadline`.
  - `open_item_rules`: `planned_submission_deadlines(user)`, `open_milestones(user)` and `active_project_clause()` in `projects/service.py`, reused by Task 3. Task 2 and 3 use the same definitions.

- [ ] **Step 1: Write failing tests**, named:
  - `test_create_defaults_stage_idea_type_personal`
  - `test_title_required_and_invalid_enum_returns_422`
  - `test_get_update_delete_project`, `test_projects_isolated_between_users` (using `assert_isolated`)
  - `test_filter_by_stage_type_and_active`; `active=true` excludes `published` and `paused`
  - `test_search_matches_title_topic_institution_literally`, with rows containing literal `%` and `_`
  - `test_sort_by_target_date_title_and_unknown_sort_returns_422`
  - `test_stage_change_logs_old_and_new`, `test_no_activity_when_patch_changes_nothing`
  - `test_counts_and_next_deadline`: inserts rows directly for now; next deadline ignores past dates, done milestones and non-`planned` submissions
  - `test_list_uses_fixed_query_count`: the number of SQL statements doesn't grow with the number of projects
  - `test_notes_and_reminders_attach_to_project`; `test_cannot_attach_to_other_users_project` returns `404`
  - `test_contact_link_rejects_project_entity` returns `422`
  - `test_delete_removes_children_notes_reminders_keeps_activity_label`
  - `test_deleted_project_reminder_not_due_anywhere`: its reminder is gone from `/reminders?due_within_days=3` and `/dashboard/upcoming-deadlines`
  - `test_migration_upgrade_downgrade_keeps_existing_rows`, following `test_migration_job_options.py`; downgrade removes notes, reminders and activity with `project` before restoring constraints
- [ ] **Step 2:** Run `pytest tests/test_projects.py tests/test_migration_projects.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement the module and migration `0006` on revision `0005`. Widen the entity type `CHECK`s on notes and reminders, and activity's if one exists; leave `ck_contact_links_entity_type` alone. Compute counts with correlated subqueries or joined aggregates, not per-row queries. Add the spec's indexes.
- [ ] **Step 4:** Run `pytest -q && ruff check . && mypy app && alembic check`. Expected: all pass, one head.
- [ ] **Step 5: Commit** `feat(projects): add research projects API and migration`

### Task 2: Submissions and milestones API

**Branch:** `feature/project-items-api`

**Files:**
- Modify: `backend/app/modules/projects/{schemas,service,router}.py`
- Test: `backend/tests/test_project_items.py`

**Interfaces:**
- Consumes: `get_project`, `log_activity`.
- Produces: routes from spec section 3; `SubmissionOut`, `MilestoneOut`. Sub-lists return `{items, total, page, page_size}`; milestones sort by due date with undated last, then `created_at`.

- [ ] **Step 1: Write failing tests**, named:
  - `test_submission_crud_defaults_conference_planned`, `test_submission_venue_url_rejects_non_http`
  - `test_abstract_after_paper_returns_422_on_create`
  - `test_patch_only_abstract_after_stored_paper_returns_422`, `test_patch_clearing_a_deadline_succeeds`
  - `test_several_submissions_on_one_project`
  - `test_submission_status_change_logs_venue_old_new`, `test_submission_added_logged_on_project`
  - `test_milestone_crud_and_order_undated_last`
  - `test_ticking_twice_keeps_completed_at_and_logs_once`
  - `test_reopen_clears_completed_at_then_ticking_logs_again`
  - `test_item_under_wrong_project_returns_404_and_changes_nothing`, for `PATCH` and `DELETE` on both kinds
  - `test_items_isolated_between_users`, for every route of both kinds, including `POST` under another user's project
  - `test_counts_and_next_deadline_follow_changes`
- [ ] **Step 2:** Run `pytest tests/test_project_items.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement. Scope every item query by `user_id` and `project_id`. Merge stored values with the patch before checking deadline order.
- [ ] **Step 4:** Run `pytest -q && ruff check . && mypy app`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(projects): add submissions and milestones API`

### Task 3: Dashboard API

**Branch:** `feature/projects-dashboard-api`

**Files:**
- Modify: `backend/app/modules/dashboard/{schemas,service,router}.py`, `docs/superpowers/specs/2026-11-06-careerlab-design.md`
- Test: `backend/tests/test_projects_dashboard.py`

**Interfaces:**
- Consumes: the rules from `projects/service.py`.
- Produces:
  - `summary` gains `active_research_projects`; `upcoming_deadlines` counts research items.
  - `upcoming-deadlines` kinds `project_submission_deadline` and `project_milestone`, with `project_id` and `project_title`. Existing kinds are unchanged, with those two fields null.
  - `GET /dashboard/overdue-research?today=` returns `[{kind, id, title, due, project_id, project_title}]`, oldest first, capped at 50. `title` is the venue with "abstract" or "paper", or the milestone title.

- [ ] **Step 1: Write failing tests** with an injected `now`, named:
  - `test_upcoming_boundaries_day_0_14_15`, for abstract, paper and milestone, parametrized
  - `test_abstract_and_paper_count_as_two_items`
  - `test_submission_leaving_planned_stops_counting`
  - `test_done_milestone_stops_counting`, `test_milestone_with_no_due_date_never_counts`
  - `test_paused_and_published_projects_excluded_then_return_when_resumed`
  - `test_summary_count_equals_list_length_with_research_items`
  - `test_active_research_projects_count`
  - `test_overdue_oldest_first_capped_at_50_and_today_is_not_overdue`
  - `test_today_parameter_applies_to_research_items`, `test_out_of_range_today_returns_422`
  - `test_dashboard_excludes_other_users_research_items`
- [ ] **Step 2:** Run `pytest tests/test_projects_dashboard.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement with SQL rules shared with the summary. Update the main spec's Upcoming deadlines definition.
- [ ] **Step 4:** Run `pytest -q && ruff check . && mypy app`. Expected: all pass, including the existing `test_dashboard.py`.
- [ ] **Step 5: Commit** `feat(dashboard): add research deadlines and overdue items`

### Task 4: Project list, form and Kanban

**Branch:** `feature/projects-ui`

**Files:**
- Create: `frontend/app/(app)/projects/page.tsx`, `frontend/components/projects/{project-form,projects-list,projects-table}.tsx`
- Modify: `frontend/components/app-shell.tsx`, `frontend/lib/enums.ts`, `frontend/lib/types.ts`, `frontend/lib/keys.ts`

**Interfaces:**
- Consumes: `ListToolbar`, `KanbanBoard`, `useStatusMove`, `FormSection`, `Pagination`, `usePageClamp`, `DataState`, `formatDateOnly`, and the category switch pattern.
- Produces: `PROJECT_STAGES`, `PROJECT_TYPES`, `SUBMISSION_STATUSES`, `VENUE_TYPES`; `Project`, `ProjectSubmission`, `ProjectMilestone` types; `RESOURCE.project = "projects"`, so the shared panels accept `entityType="project"`; `<ProjectFormDialog>`.

- [ ] **Step 1:** Add the enums with labels, colours and icons, types, keys, and the sidebar item **Research Projects** after Research Opportunities. If adding `project` to `EntityType` breaks a type check in a panel, fix the panel generically.
- [ ] **Step 2:** Implement the list per spec section 4: table and Kanban, toolbar, All / Active switch kept in the URL as `active`, progress bar and next deadline on cards and rows. Unknown filter values are ignored by the shared helper.
- [ ] **Step 3:** Implement the form: title first, the rest in `FormSection`s; emptied optional inputs send `null`; only dirty fields on `PATCH`.
- [ ] **Step 4:** Run `npm run lint && npm run typecheck && npm run build`. Browser-check with the local stack: create and edit a project, move it on the board and refresh, block the `PATCH` and see it roll back, filters survive refresh, the empty state on a new account, and 375px with no sideways scroll in both modes.
- [ ] **Step 5: Commit** `feat(frontend): add research projects list, form and Kanban`

### Task 5: Project page, panels and dashboard

**Branch:** `feature/project-page`

**Files:**
- Create: `frontend/app/(app)/projects/[id]/page.tsx`, `frontend/components/projects/{submissions-panel,submission-form,milestones-panel}.tsx`
- Modify: `frontend/app/(app)/dashboard/page.tsx`, `frontend/lib/keys.ts`

**Interfaces:**
- Consumes: `EntityDetailPage`, `detail-parts`, `NotesPanel`, `RemindersPanel`, `ActivityTimeline`, `ConfirmDialog`, the date chip and "in N days" helpers from the dashboard.
- Produces: `invalidateProject(queryClient, id)`, covering project lists, detail, sub-lists, activity and `["dashboard"]`.

- [ ] **Step 1:** Implement the project page. `LinkedContacts` is not shown on it. Deleting states that submissions, milestones, notes and reminders go too.
- [ ] **Step 2:** Implement the submissions panel: rows with status, deadlines and how soon they're due; dialog for add and edit, including feedback; delete with confirmation; a client check that the abstract isn't after the paper; server errors shown on fields; `venue_url` as a link only if `safeHttpUrl` passes.
- [ ] **Step 3:** Implement the milestones panel: checklist, inline add, edit and delete, "N of M done" progress bar with a text alternative. A failed save reverts and shows an error. Rapid ticks of different milestones must not lose a change. Overdue items stand out in text and colour.
- [ ] **Step 4:** Update the dashboard: an Active research projects compact card in the existing grid; research kinds in Upcoming deadlines with labels and icons, linking to the project page; `/dashboard/overdue-research` items in the Overdue section with overdue reminders, keeping its existing order and phone layout. Every project mutation uses `invalidateProject`. Query keys include `today`.
- [ ] **Step 5:** Run `npm run lint && npm run typecheck && npm run build`. Browser-check: add, edit and delete submissions and milestones; two submissions on one project; pause a project and see its dashboard items leave; a not-found state for a foreign id; 375px, 768px and desktop, in both modes.
- [ ] **Step 6: Commit** `feat(frontend): add project page, submissions, milestones and dashboard items`

### Task 6: End-to-end tests, seed and docs

**Branch:** `feature/projects-e2e`

**Files:**
- Create: `frontend/e2e/research-projects.spec.ts`
- Modify: `frontend/e2e/isolation.spec.ts`, `backend/scripts/seed_demo.py`, `backend/tests/test_seed_demo.py`, `README.md`, `docs/api.md`, `docs/database.md`, `docs/architecture.md`, `docs/demo-script.md`

- [ ] **Step 1: Write the Playwright test:** create a project, add a planned submission due within 14 days and a milestone, tick the milestone and see "1 of 2 done", move the project on the board, see the deadline on the dashboard, delete the project and see it leave. Runs at desktop and 375px. Add to the isolation spec: user B opening user A's project URL sees not-found with none of its data.
- [ ] **Step 2:** Run with `RATE_LIMIT_REGISTER_PER_MINUTE=1000 docker compose up -d --build`, then `npm run test:e2e` in `frontend/`, at least three times. Expected: all pass each time. Fix what fails, and list any app bugs in the report.
- [ ] **Step 3:** Update the seed with fictional projects, including one rejected submission followed by another venue. Update the docs, including the ER diagram and route table. Add a README screenshot of a project page only if it's legible.
- [ ] **Step 4:** Run `pytest -q && ruff check . && mypy app` and `npm run lint && npm run typecheck && npm run build`. Expected: all pass.
- [ ] **Step 5: Commit** `test(e2e): cover research projects and update docs`
- [ ] **Step 6:** The controller opens the PR, so that the Playwright job runs in CI, and merges when it passes.
