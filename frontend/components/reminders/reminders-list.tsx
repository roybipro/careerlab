"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Pencil, Plus, RotateCcw, SearchX, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataState, EmptyState } from "@/components/data-state";
import { ListToolbar, useListParams, usePageClamp } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { ReminderFormDialog } from "@/components/reminders/reminder-form";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { Option } from "@/lib/enums";
import { formatDateTime } from "@/lib/format";
import { invalidateReminders, keys } from "@/lib/keys";
import { entityHref } from "@/lib/navigation";
import type { Paginated, Reminder } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

// Values match SORT_FIELDS in backend/app/modules/reminders/service.py. The first option of each
// list is that tab's default sort, so it is not written to the URL.
const OPEN_SORT: Option[] = [
  { value: "due_at", label: "Due soonest" },
  { value: "-due_at", label: "Due latest" },
  { value: "-created_at", label: "Newest added" },
  { value: "created_at", label: "Oldest added" },
  { value: "title", label: "Title A-Z" },
  { value: "-title", label: "Title Z-A" },
];
const OVERDUE_SORT: Option[] = [{ value: "due_at", label: "Most overdue first" }, ...OPEN_SORT.slice(1)];
const COMPLETED_SORT: Option[] = [
  { value: "-completed_at", label: "Recently completed" },
  { value: "completed_at", label: "Completed longest ago" },
  ...OPEN_SORT,
];

const TABS = [
  { value: "overdue", label: "Overdue", sortOptions: OVERDUE_SORT, empty: "Nothing is overdue." },
  { value: "upcoming", label: "Upcoming", sortOptions: OPEN_SORT, empty: "No upcoming reminders." },
  { value: "completed", label: "Completed", sortOptions: COMPLETED_SORT, empty: "No completed reminders yet." },
] as const;

const RELATED_LABEL: Record<string, string> = { job: "job", research: "research opportunity", contact: "contact" };

/** Needs a Suspense boundary above it: the tab and page live in the URL search parameters. */
export function RemindersList() {
  const { get, page, update } = useListParams();
  const tab = TABS.find((t) => t.value === get("state")) ?? TABS[1];
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Reminder | null>(null);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const client = useQueryClient();

  // A sort left over from another tab, or typed into the URL, falls back to this tab's default.
  const sort = tab.sortOptions.find((o) => o.value === get("sort"))?.value ?? tab.sortOptions[0].value;
  const q = get("q");
  const params = { state: tab.value, q, sort, page, page_size: PAGE_SIZE };
  const query = useQuery({
    queryKey: keys.reminderList(params),
    queryFn: () => api<Paginated<Reminder>>("/reminders", { query: params }),
    placeholderData: keepPreviousData,
  });
  usePageClamp(query, page, update);

  const toggle = useMutation({
    mutationFn: (r: Reminder) => api<Reminder>(`/reminders/${r.id}`, { method: "PATCH", body: { is_completed: !r.is_completed } }),
    onSuccess: () => void invalidateReminders(client),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not update the reminder."),
  });

  const remove = useMutation({
    mutationFn: (r: Reminder) => api<void>(`/reminders/${r.id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleting(null);
      void invalidateReminders(client);
    },
    onError: (e) => {
      setDeleting(null);
      toast.error(e instanceof ApiError ? e.message : "Could not delete the reminder.");
    },
  });

  return (
    <>
      <PageHeader
        title="Reminders"
        icon={Bell}
        description="Deadlines and follow-ups."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus data-icon="inline-start" />
            Add reminder
          </Button>
        }
      />
      <div role="tablist" aria-label="Reminder state" className="mb-4 inline-flex gap-0.5 rounded-xl bg-muted p-1">
        {TABS.map((t) => (
          <Button
            key={t.value}
            role="tab"
            aria-selected={t.value === tab.value}
            variant="ghost"
            size="sm"
            className={t.value === tab.value ? "bg-card text-foreground shadow-card hover:bg-card" : "text-muted-foreground"}
            // Each tab starts on its own default sort and page 1; the search text stays.
            onClick={() => update({ state: t.value === "upcoming" ? null : t.value, sort: null })}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {/* Keyed by tab so the sort control's options and default follow the tab. */}
      <ListToolbar key={tab.value} filters={[]} searchPlaceholder="Search title or details" sortOptions={[...tab.sortOptions]} />
      <div role="tabpanel" aria-label={tab.label}>
        <DataState
          query={query}
          empty={
            q ? (
              <EmptyState icon={SearchX} title="No reminders match" description="Try different search words, or clear the search." />
            ) : (
              <EmptyState
                icon={tab.value === "completed" ? Check : Bell}
                title={tab.empty}
                description={tab.value === "completed" ? "Reminders you complete show up here." : "Add a reminder for a follow-up, a deadline or anything you should not forget."}
                action={
                  tab.value === "completed" ? undefined : (
                    <Button onClick={() => setAdding(true)}>
                      <Plus data-icon="inline-start" />
                      Add a reminder
                    </Button>
                  )
                }
              />
            )
          }
        >
          {(data) => (
            <>
              <ul className="divide-y rounded-2xl border bg-card shadow-card">
                {data.items.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 p-4">
                    <div className="min-w-0 flex-[1_1_16rem]">
                      <p className={cn("text-sm font-medium break-words", r.is_completed && "text-muted-foreground line-through")}>{r.title}</p>
                      {r.description ? <p className="mt-0.5 text-sm break-words whitespace-pre-wrap text-muted-foreground">{r.description}</p> : null}
                      <p className={cn("mt-1 text-xs", tab.value === "overdue" ? "text-destructive" : "text-muted-foreground")}>
                        {r.is_completed ? `Done ${formatDateTime(r.completed_at)}. Was due ${formatDateTime(r.due_at)}` : `Due ${formatDateTime(r.due_at)}`}
                        {r.related_type && r.related_id ? (
                          <>
                            {" · "}
                            <Link href={entityHref(r.related_type, r.related_id)} className="inline-flex min-h-10 items-center text-link underline underline-offset-4 md:min-h-0">
                              Open {RELATED_LABEL[r.related_type]}
                            </Link>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={toggle.isPending}
                      aria-label={`${r.is_completed ? "Reopen" : "Complete"} ${r.title}`}
                      onClick={() => toggle.mutate(r)}
                    >
                      {r.is_completed ? <RotateCcw data-icon="inline-start" /> : <Check data-icon="inline-start" />}
                      {r.is_completed ? "Reopen" : "Complete"}
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit reminder ${r.title}`} onClick={() => setEditing(r)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete reminder ${r.title}`} onClick={() => setDeleting(r)}>
                      <Trash2 />
                    </Button>
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={(p) => update({ page: String(p) })} />
            </>
          )}
        </DataState>
      </div>
      <ReminderFormDialog open={adding} onOpenChange={setAdding} />
      <ReminderFormDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} reminder={editing ?? undefined} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this reminder?"
        description="The reminder is deleted permanently."
        confirmLabel="Delete reminder"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </>
  );
}
