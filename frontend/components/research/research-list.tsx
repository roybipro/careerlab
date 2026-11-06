"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { DataState, EmptyState } from "@/components/data-state";
import { KanbanBoard } from "@/components/kanban-board";
import { ListToolbar, useListParams, type ToolbarFilter } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { ResearchFormDialog } from "@/components/research/research-form";
import { ResearchKanbanCard, ResearchTable } from "@/components/research/research-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { FUNDING_STATUSES, OPPORTUNITY_TYPES, RESEARCH_STATUSES, type Option } from "@/lib/enums";
import { keys } from "@/lib/keys";
import type { Paginated, Research } from "@/lib/types";
import { useStatusMove } from "@/lib/use-status-move";

const TABLE_PAGE_SIZE = 20;
const KANBAN_LIMIT = 100;

// The board shows all nine statuses, archived included: archiving is only a status change.
const COLUMNS = RESEARCH_STATUSES.map((s) => ({ id: s.value, label: s.label }));

const FILTERS: ToolbarFilter[] = [
  { type: "select", key: "status", label: "Status", options: RESEARCH_STATUSES },
  { type: "select", key: "opportunity_type", label: "Type", options: OPPORTUNITY_TYPES },
  { type: "select", key: "funding_status", label: "Funding", options: FUNDING_STATUSES },
  { type: "text", key: "country", label: "Country" },
  { type: "date", key: "deadline_from", label: "Deadline from" },
  { type: "date", key: "deadline_to", label: "Deadline to" },
];

// Values match SORT_FIELDS in backend/app/modules/research/service.py. The first is the API default.
const SORT_OPTIONS: Option[] = [
  { value: "-created_at", label: "Newest added" },
  { value: "created_at", label: "Oldest added" },
  { value: "-updated_at", label: "Recently updated" },
  { value: "title", label: "Title A-Z" },
  { value: "-title", label: "Title Z-A" },
  { value: "organization", label: "Organization A-Z" },
  { value: "-organization", label: "Organization Z-A" },
  { value: "country", label: "Country A-Z" },
  { value: "deadline", label: "Deadline, soonest" },
  { value: "-deadline", label: "Deadline, latest" },
  { value: "application_date", label: "Applied, oldest" },
  { value: "-application_date", label: "Applied, newest" },
];

/** Needs a Suspense boundary above it: the toolbar reads the URL search parameters. */
export function ResearchList() {
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
    queryKey: keys.list("research", params),
    queryFn: () => api<Paginated<Research>>("/research", { query: params }),
    placeholderData: keepPreviousData,
  });

  const move = useStatusMove<Research>("research", "/research", (item) => item.title);

  const empty = filtersActive ? (
    <EmptyState title="No opportunities match" description="Try different search words, or clear the filters." />
  ) : (
    <EmptyState
      title="No research opportunities yet"
      description="Add the labs, programs and fellowships you are looking at, then move them along as you go."
      action={
        <Button onClick={() => setAdding(true)}>
          <Plus data-icon="inline-start" />
          Add your first opportunity
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Research Opportunities"
        description="Labs, fellowships and programs you are pursuing."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus data-icon="inline-start" />
            Add opportunity
          </Button>
        }
      />
      <ListToolbar filters={filters} searchPlaceholder="Search title, organization, professor or area" viewToggle sortOptions={SORT_OPTIONS} />
      <DataState query={query} empty={empty}>
        {(data) =>
          view === "kanban" ? (
            <>
              {data.total > KANBAN_LIMIT ? (
                <Alert className="mb-3">
                  <AlertDescription>
                    Showing {KANBAN_LIMIT} of {data.total} opportunities. Use the search and filters to narrow the board.
                  </AlertDescription>
                </Alert>
              ) : null}
              <KanbanBoard
                columns={COLUMNS}
                items={data.items}
                getItemLabel={(item) => `${item.title}, ${item.organization}`}
                onMove={(item, status) => move.mutate({ item, status })}
                renderCard={(item) => <ResearchKanbanCard item={item} />}
              />
            </>
          ) : (
            <>
              <ResearchTable items={data.items} />
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={(p) => update({ page: String(p) })} />
            </>
          )
        }
      </DataState>
      <ResearchFormDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
