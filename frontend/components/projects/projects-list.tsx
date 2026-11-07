"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FolderKanban, Plus, SearchX } from "lucide-react";
import { useState } from "react";
import { DataState, EmptyState } from "@/components/data-state";
import { KanbanBoard } from "@/components/kanban-board";
import { ListSwitch, readSwitch } from "@/components/list-switch";
import { ListToolbar, filterValues as readFilterValues, useListParams, usePageClamp, type ToolbarFilter } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { ProjectFormDialog } from "@/components/projects/project-form";
import { ProjectKanbanCard, ProjectsTable } from "@/components/projects/projects-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { PROJECT_SCOPES, PROJECT_STAGES, PROJECT_TYPES, type Option } from "@/lib/enums";
import { localToday } from "@/lib/format";
import { keys } from "@/lib/keys";
import type { Paginated, Project } from "@/lib/types";
import { useStatusMove } from "@/lib/use-status-move";

const TABLE_PAGE_SIZE = 20;
const KANBAN_LIMIT = 100;

// The board shows all seven stages, published and paused included: pausing is only a stage change.
const COLUMNS = PROJECT_STAGES.map((s) => ({ id: s.value, label: s.label }));

const FILTERS: ToolbarFilter[] = [
  { type: "select", key: "stage", label: "Stage", options: PROJECT_STAGES },
  { type: "select", key: "project_type", label: "Type", options: PROJECT_TYPES },
];

// Values match SORT_FIELDS in backend/app/modules/projects/service.py. The first is the API default.
const SORT_OPTIONS: Option[] = [
  { value: "-created_at", label: "Newest added" },
  { value: "created_at", label: "Oldest added" },
  { value: "-updated_at", label: "Recently updated" },
  { value: "title", label: "Title A-Z" },
  { value: "-title", label: "Title Z-A" },
  { value: "target_date", label: "Target date, soonest" },
  { value: "-target_date", label: "Target date, latest" },
];

/** Needs a Suspense boundary above it: the toolbar reads the URL search parameters. */
export function ProjectsList() {
  const { get, page, view, update } = useListParams();
  const [adding, setAdding] = useState(false);

  // The board shows every stage as a column, so a stage filter makes no sense there.
  const filters = view === "kanban" ? FILTERS.filter((f) => f.key !== "stage") : FILTERS;
  const filterValues = readFilterValues(get, filters);
  const sort = SORT_OPTIONS.some((o) => o.value === get("sort")) ? get("sort") : "";
  // The All / Active switch sits outside the toolbar and applies to the table and the board alike.
  const active = readSwitch(PROJECT_SCOPES, get("active"));
  const hasFilters = Object.values(filterValues).some(Boolean);
  // `today` lets the API work out each project's next deadline for the viewer's local date, as the dashboard does.
  const params =
    view === "kanban"
      ? { ...filterValues, active, sort, page_size: KANBAN_LIMIT, today: localToday() }
      : { ...filterValues, active, sort, page, page_size: TABLE_PAGE_SIZE, today: localToday() };

  const query = useQuery({
    queryKey: keys.list("project", params),
    queryFn: () => api<Paginated<Project>>("/projects", { query: params }),
    placeholderData: keepPreviousData,
  });
  usePageClamp(query, page, update, view !== "kanban");

  const move = useStatusMove<Project>("project", "/projects", (project) => project.title, "stage");

  const empty = hasFilters ? (
    <EmptyState icon={SearchX} title="No projects match" description="Try different search words, or clear the filters." />
  ) : active ? (
    <EmptyState
      icon={FolderKanban}
      title="No active projects"
      description="Projects that are not published or paused show here. Show all projects, or add a new one."
      action={
        <Button variant="outline" onClick={() => update({ active: null })}>
          Show all
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={FolderKanban}
      title="No research projects yet"
      description="A research project is your own work, such as a paper, thesis or study. Track its milestones and the venues you plan to submit to."
      action={
        <Button onClick={() => setAdding(true)}>
          <Plus data-icon="inline-start" />
          Add your first project
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Research Projects"
        icon={FolderKanban}
        description="Your own papers, theses and studies, from idea to publication."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus data-icon="inline-start" />
            Add project
          </Button>
        }
      />
      <ListSwitch param="active" label="Show" options={PROJECT_SCOPES} />
      <ListToolbar filters={filters} searchPlaceholder="Search title, topic or institution" viewToggle sortOptions={SORT_OPTIONS} />
      <DataState query={query} empty={empty}>
        {(data) =>
          view === "kanban" ? (
            <>
              {data.total > KANBAN_LIMIT ? (
                <Alert className="mb-3">
                  <AlertDescription>
                    Showing {KANBAN_LIMIT} of {data.total} projects. Use the search and filters to narrow the board.
                  </AlertDescription>
                </Alert>
              ) : null}
              <KanbanBoard
                columns={COLUMNS}
                items={data.items}
                getColumn={(project) => project.stage}
                getItemLabel={(project) => project.title}
                onMove={(project, stage) => move.mutate({ item: project, status: stage })}
                renderCard={(project) => <ProjectKanbanCard project={project} />}
              />
            </>
          ) : (
            <>
              <ProjectsTable projects={data.items} />
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={(p) => update({ page: String(p) })} />
            </>
          )
        }
      </DataState>
      <ProjectFormDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
