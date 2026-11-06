"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DataState, EmptyState } from "@/components/data-state";
import { JobFormDialog } from "@/components/jobs/job-form";
import { JobKanbanCard, JobsTable } from "@/components/jobs/jobs-table";
import { KanbanBoard } from "@/components/kanban-board";
import { ListToolbar, useListParams, type ToolbarFilter } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { JOB_STATUSES, JOB_TYPES, PRIORITIES, statusLabel, type Option } from "@/lib/enums";
import { invalidateEntity, keys } from "@/lib/keys";
import type { Job, Paginated } from "@/lib/types";

const TABLE_PAGE_SIZE = 20;
const KANBAN_LIMIT = 100;

const COLUMNS = JOB_STATUSES.map((s) => ({ id: s.value, label: s.label }));

const FILTERS: ToolbarFilter[] = [
  { type: "select", key: "status", label: "Status", options: JOB_STATUSES },
  { type: "select", key: "priority", label: "Priority", options: PRIORITIES },
  { type: "select", key: "job_type", label: "Job type", options: JOB_TYPES },
  { type: "date", key: "deadline_from", label: "Deadline from" },
  { type: "date", key: "deadline_to", label: "Deadline to" },
  { type: "date", key: "application_date_from", label: "Applied from" },
  { type: "date", key: "application_date_to", label: "Applied to" },
];

// Values match SORT_FIELDS in backend/app/modules/jobs/service.py. The first is the API default.
const SORT_OPTIONS: Option[] = [
  { value: "-created_at", label: "Newest added" },
  { value: "created_at", label: "Oldest added" },
  { value: "-updated_at", label: "Recently updated" },
  { value: "company_name", label: "Company A-Z" },
  { value: "-company_name", label: "Company Z-A" },
  { value: "position_title", label: "Position A-Z" },
  { value: "deadline", label: "Deadline, soonest" },
  { value: "-deadline", label: "Deadline, latest" },
  { value: "follow_up_date", label: "Follow-up, soonest" },
  { value: "interview_at", label: "Interview, soonest" },
  { value: "application_date", label: "Applied, oldest" },
  { value: "-application_date", label: "Applied, newest" },
];

/** Needs a Suspense boundary above it: the toolbar reads the URL search parameters. */
export function JobsList() {
  const client = useQueryClient();
  const { get, page, view, update } = useListParams();
  const [adding, setAdding] = useState(false);

  // The board shows every status as a column, so a status filter makes no sense there.
  const filters = view === "kanban" ? FILTERS.filter((f) => f.key !== "status") : FILTERS;
  const filterValues = Object.fromEntries(["q", ...filters.map((f) => f.key)].map((k) => [k, get(k)]));
  const sort = SORT_OPTIONS.some((o) => o.value === get("sort")) ? get("sort") : "";
  const filtersActive = Object.values(filterValues).some(Boolean);
  const params =
    view === "kanban"
      ? { ...filterValues, sort, page_size: KANBAN_LIMIT }
      : { ...filterValues, sort, page, page_size: TABLE_PAGE_SIZE };

  const query = useQuery({
    queryKey: keys.list("job", params),
    queryFn: () => api<Paginated<Job>>("/jobs", { query: params }),
    placeholderData: keepPreviousData,
  });

  const move = useMutation({
    mutationFn: ({ job, status }: { job: Job; status: string }) => api<Job>(`/jobs/${job.id}`, { method: "PATCH", body: { status } }),
    onMutate: async ({ job, status }) => {
      // Stop in-flight refetches from overwriting the optimistic status.
      await client.cancelQueries({ queryKey: ["jobs"] });
      setStatusInLists(job.id, status);
    },
    onError: (error, { job, status }) => {
      setStatusInLists(job.id, job.status);
      const reason = error instanceof ApiError ? error.message : "Something went wrong.";
      toast.error(`Could not move ${job.company_name} to ${statusLabel(status)}. ${reason}`);
    },
    onSettled: (_data, _error, { job }) => invalidateEntity(client, "job", job.id),
  });

  function setStatusInLists(id: string, status: string) {
    client.setQueriesData<Paginated<Job>>({ queryKey: ["jobs", "list"] }, (old) =>
      old ? { ...old, items: old.items.map((j) => (j.id === id ? { ...j, status } : j)) } : old,
    );
  }

  const empty = filtersActive ? (
    <EmptyState title="No jobs match" description="Try different search words, or clear the filters." />
  ) : (
    <EmptyState
      title="No job applications yet"
      description="Add the roles you are looking at, then move them from saved to offer as you go."
      action={
        <Button onClick={() => setAdding(true)}>
          <Plus data-icon="inline-start" />
          Add your first job
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Job Applications"
        description="Track every application from saved to offer."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus data-icon="inline-start" />
            Add job
          </Button>
        }
      />
      <ListToolbar filters={filters} searchPlaceholder="Search company, position or location" viewToggle sortOptions={SORT_OPTIONS} />
      <DataState query={query} empty={empty}>
        {(data) =>
          view === "kanban" ? (
            <>
              {data.total > KANBAN_LIMIT ? (
                <Alert className="mb-3">
                  <AlertDescription>
                    Showing {KANBAN_LIMIT} of {data.total} applications. Use the search and filters to narrow the board.
                  </AlertDescription>
                </Alert>
              ) : null}
              <KanbanBoard
                columns={COLUMNS}
                items={data.items}
                getItemLabel={(job) => `${job.company_name}, ${job.position_title}`}
                onMove={(job, status) => move.mutate({ job, status })}
                renderCard={(job) => <JobKanbanCard job={job} />}
              />
            </>
          ) : (
            <>
              <JobsTable jobs={data.items} />
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={(p) => update({ page: String(p) })} />
            </>
          )
        }
      </DataState>
      <JobFormDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
