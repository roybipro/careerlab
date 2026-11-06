"use client";

import { useQuery } from "@tanstack/react-query";
import { Briefcase, Contact, FlaskConical, Plus, BellPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ContactFormDialog } from "@/components/contacts/contact-form";
import { DataState, EmptyState } from "@/components/data-state";
import { describeActivity } from "@/components/entity/activity-timeline";
import { JobFormDialog } from "@/components/jobs/job-form";
import { PageHeader } from "@/components/page-header";
import { ReminderFormDialog } from "@/components/reminders/reminder-form";
import { ResearchFormDialog } from "@/components/research/research-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth";
import { statusLabel } from "@/lib/enums";
import { formatDateOnly, formatDateTime, localToday } from "@/lib/format";
import { keys } from "@/lib/keys";
import { entityHref } from "@/lib/navigation";
import type { Activity, Analytics, DashboardSummary, Deadline, Paginated, Reminder, StatusCount } from "@/lib/types";
import { cn } from "@/lib/utils";

const CARDS: { key: keyof DashboardSummary; label: string; hint: string }[] = [
  { key: "total_jobs", label: "Total job applications", hint: "All jobs you track" },
  { key: "total_research", label: "Total research opportunities", hint: "All opportunities you track" },
  { key: "in_progress", label: "Applications in progress", hint: "Preparing, applied, assessment or interview" },
  { key: "interviews_scheduled", label: "Interviews scheduled", hint: "Jobs with an interview in the future" },
  { key: "offers", label: "Offers received", hint: "Job offers and accepted research" },
  { key: "rejected", label: "Rejected applications", hint: "Jobs and research rejected" },
  { key: "upcoming_deadlines", label: "Upcoming deadlines", hint: "Due in the next 14 days, with reminders" },
  { key: "pending_follow_ups", label: "Pending follow-ups", hint: "Overdue or due in the next 7 days" },
];

function SummaryCards() {
  // The browser's date, so "due today" means today where the user is (the API only knows UTC).
  const today = localToday();
  const query = useQuery({
    queryKey: keys.dashboardPart("summary", today),
    queryFn: () => api<DashboardSummary>("/dashboard/summary", { query: { today } }),
  });
  return (
    <DataState query={query} isEmpty={() => false}>
      {(data) => (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {CARDS.map((c) => (
            <li key={c.key}>
              <Card size="sm" className="h-full">
                <CardContent className="space-y-1">
                  <p className="text-sm text-muted-foreground">{c.label}</p>
                  <p className="text-3xl font-semibold tabular-nums" data-testid={`card-${c.key}`}>
                    {data[c.key]}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.hint}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </DataState>
  );
}

function Pipeline({ title, counts, basePath }: { title: string; counts: StatusCount[]; basePath: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-2 gap-2">
          {counts.map((c) => (
            <li key={c.status}>
              <Link
                href={`${basePath}?status=${c.status}`}
                aria-label={`${statusLabel(c.status)}: ${c.count}. Show in list`}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
              >
                <span className={cn("truncate", c.count === 0 && "text-muted-foreground")}>{statusLabel(c.status)}</span>
                <span className={cn("font-semibold tabular-nums", c.count === 0 && "font-normal text-muted-foreground")}>{c.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Pipelines() {
  const query = useQuery({ queryKey: keys.dashboardPart("analytics"), queryFn: () => api<Analytics>("/dashboard/analytics") });
  return (
    <DataState query={query} isEmpty={() => false}>
      {(data) => (
        <div className="grid gap-6 lg:grid-cols-2">
          <Pipeline title="Job pipeline" counts={data.job_status} basePath="/jobs" />
          <Pipeline title="Research pipeline" counts={data.research_status} basePath="/research" />
        </div>
      )}
    </DataState>
  );
}

const KIND_LABEL: Record<Deadline["kind"], string> = { job_deadline: "Job deadline", research_deadline: "Research deadline", reminder: "Reminder" };

function deadlineHref(d: Deadline): string {
  if (d.kind === "job_deadline") return entityHref("job", d.id);
  if (d.kind === "research_deadline") return entityHref("research", d.id);
  return "/reminders";
}

function Deadlines() {
  const today = localToday();
  const query = useQuery({
    queryKey: keys.dashboardPart("deadlines", today),
    queryFn: () => api<Deadline[]>("/dashboard/upcoming-deadlines", { query: { today } }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming deadlines</CardTitle>
      </CardHeader>
      <CardContent>
        <DataState query={query} empty={<p className="text-sm text-muted-foreground">Nothing due in the next 14 days. Deadlines on active jobs and research, and your reminders, show up here.</p>}>
          {(items) => (
            <ul className="space-y-2">
              {items.map((d) => (
                <li key={`${d.kind}-${d.id}`}>
                  <Link href={deadlineHref(d)} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium break-words">{d.title}</p>
                      <p className="text-xs text-muted-foreground">{d.kind === "reminder" ? formatDateTime(d.due) : formatDateOnly(d.due)}</p>
                    </div>
                    <Badge variant="secondary">{KIND_LABEL[d.kind]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DataState>
      </CardContent>
    </Card>
  );
}

const OVERDUE_HREF = "/reminders?state=overdue";
const OVERDUE_SHOWN = 5;

/** Incomplete reminders already past due. Shows nothing at all when there are none. */
function OverdueReminders() {
  const query = useQuery({
    queryKey: keys.dashboardPart("overdue"),
    queryFn: () => api<Paginated<Reminder>>("/reminders", { query: { state: "overdue", sort: "due_at", page_size: OVERDUE_SHOWN } }),
    // Overdue is judged when the list is fetched, so look again every minute.
    refetchInterval: 60_000,
  });
  if (query.isPending) return null;
  if (query.isError && !query.data) return <DataState query={query}>{() => null}</DataState>;
  const data = query.data;
  if (!data || data.total === 0) return null;
  return (
    <Card data-testid="overdue-section" className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Overdue ({data.total})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="space-y-2">
          {data.items.map((r) => (
            <li key={r.id}>
              <Link href={OVERDUE_HREF} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words">{r.title}</p>
                  <p className="text-xs text-destructive">Was due {formatDateTime(r.due_at)}</p>
                </div>
                <Badge variant="destructive">Overdue</Badge>
              </Link>
            </li>
          ))}
        </ul>
        <Link href={OVERDUE_HREF} className="inline-block text-sm underline underline-offset-4">
          {data.total > OVERDUE_SHOWN ? `View all ${data.total} overdue reminders` : "View in reminders"}
        </Link>
      </CardContent>
    </Card>
  );
}

function RecentActivity({ onAddJob }: { onAddJob: () => void }) {
  const query = useQuery({ queryKey: keys.dashboardPart("activity"), queryFn: () => api<Activity[]>("/dashboard/recent-activities") });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        <DataState
          query={query}
          empty={
            <EmptyState
              title="Nothing has happened yet"
              description="Add your first job application and your progress is recorded here."
              action={
                <Button onClick={onAddJob}>
                  <Plus data-icon="inline-start" />
                  Add your first job
                </Button>
              }
            />
          }
        >
          {(items) => (
            <ul className="space-y-3">
              {items.map((a) => {
                const label = typeof a.metadata.label === "string" ? a.metadata.label : null;
                const text = (
                  <>
                    <span className="text-sm break-words">{label ?? "Item"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {describeActivity(a)} · {formatDateTime(a.created_at)}
                    </span>
                  </>
                );
                // A deleted item has no page to open. Older events for an item deleted later may still land on "not found".
                return (
                  <li key={a.id}>
                    {a.action === "deleted" ? <div>{text}</div> : <Link href={entityHref(a.entity_type, a.entity_id)} className="block rounded-md hover:underline">{text}</Link>}
                  </li>
                );
              })}
            </ul>
          )}
        </DataState>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const user = useCurrentUser();
  const [adding, setAdding] = useState<"job" | "research" | "contact" | "reminder" | null>(null);
  const close = (open: boolean) => !open && setAdding(null);

  return (
    <>
      <PageHeader
        title={user.data ? `Welcome, ${user.data.full_name.split(" ")[0]}` : "Welcome"}
        description="Your pipeline at a glance."
        actions={
          <>
            <Button onClick={() => setAdding("job")}>
              <Briefcase data-icon="inline-start" />
              Add job
            </Button>
            <Button variant="outline" onClick={() => setAdding("research")}>
              <FlaskConical data-icon="inline-start" />
              Add research
            </Button>
            <Button variant="outline" onClick={() => setAdding("contact")}>
              <Contact data-icon="inline-start" />
              Add contact
            </Button>
            <Button variant="outline" onClick={() => setAdding("reminder")}>
              <BellPlus data-icon="inline-start" />
              Add reminder
            </Button>
          </>
        }
      />
      <div className="space-y-6">
        <SummaryCards />
        <Pipelines />
        <OverdueReminders />
        <div className="grid gap-6 lg:grid-cols-2">
          <Deadlines />
          <RecentActivity onAddJob={() => setAdding("job")} />
        </div>
      </div>
      <JobFormDialog open={adding === "job"} onOpenChange={close} />
      <ResearchFormDialog open={adding === "research"} onOpenChange={close} />
      <ContactFormDialog open={adding === "contact"} onOpenChange={close} />
      <ReminderFormDialog open={adding === "reminder"} onOpenChange={close} />
    </>
  );
}
