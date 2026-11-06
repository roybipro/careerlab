"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataState, EmptyState } from "@/components/data-state";
import { useListParams, usePageClamp } from "@/components/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { ReminderFormDialog } from "@/components/reminders/reminder-form";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { invalidateReminders, keys } from "@/lib/keys";
import { entityHref } from "@/lib/navigation";
import type { Paginated, Reminder } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const TABS = [
  { value: "overdue", label: "Overdue", sort: "due_at", empty: "Nothing is overdue." },
  { value: "upcoming", label: "Upcoming", sort: "due_at", empty: "No upcoming reminders." },
  { value: "completed", label: "Completed", sort: "-completed_at", empty: "No completed reminders yet." },
] as const;

const RELATED_LABEL: Record<string, string> = { job: "job", research: "research opportunity", contact: "contact" };

/** Needs a Suspense boundary above it: the tab and page live in the URL search parameters. */
export function RemindersList() {
  const { get, page, update } = useListParams();
  const tab = TABS.find((t) => t.value === get("state")) ?? TABS[1];
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Reminder | null>(null);
  const client = useQueryClient();

  const params = { state: tab.value, sort: tab.sort, page, page_size: PAGE_SIZE };
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
        description="Deadlines and follow-ups."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus data-icon="inline-start" />
            Add reminder
          </Button>
        }
      />
      <div role="tablist" aria-label="Reminder state" className="mb-4 inline-flex rounded-lg border p-0.5">
        {TABS.map((t) => (
          <Button
            key={t.value}
            role="tab"
            aria-selected={t.value === tab.value}
            variant={t.value === tab.value ? "secondary" : "ghost"}
            size="sm"
            onClick={() => update({ state: t.value === "upcoming" ? null : t.value })}
          >
            {t.label}
          </Button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tab.label}>
        <DataState
          query={query}
          empty={
            <EmptyState
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
          }
        >
          {(data) => (
            <>
              <ul className="space-y-2">
                {data.items.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 rounded-xl border p-3">
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium break-words", r.is_completed && "text-muted-foreground line-through")}>{r.title}</p>
                      {r.description ? <p className="mt-0.5 text-sm break-words whitespace-pre-wrap text-muted-foreground">{r.description}</p> : null}
                      <p className={cn("mt-1 text-xs", tab.value === "overdue" ? "text-destructive" : "text-muted-foreground")}>
                        {r.is_completed ? `Done ${formatDateTime(r.completed_at)}. Was due ${formatDateTime(r.due_at)}` : `Due ${formatDateTime(r.due_at)}`}
                        {r.related_type && r.related_id ? (
                          <>
                            {" · "}
                            <Link href={entityHref(r.related_type, r.related_id)} className="underline underline-offset-4">
                              Open {RELATED_LABEL[r.related_type]}
                            </Link>
                          </>
                        ) : null}
                      </p>
                    </div>
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
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete reminder ${r.title}`} onClick={() => setDeleting(r)}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={(p) => update({ page: String(p) })} />
            </>
          )}
        </DataState>
      </div>
      <ReminderFormDialog open={adding} onOpenChange={setAdding} />
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
