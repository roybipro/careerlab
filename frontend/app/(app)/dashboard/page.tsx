"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  BellPlus,
  Briefcase,
  CalendarClock,
  CircleX,
  Contact,
  FlaskConical,
  History,
  Hourglass,
  LayoutDashboard,
  MessagesSquare,
  Plus,
  Reply,
  TriangleAlert,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";
import { ContactFormDialog } from "@/components/contacts/contact-form";
import { DataState, EmptyState } from "@/components/data-state";
import { ActivityIcon, describeActivity } from "@/components/entity/activity-timeline";
import { JobFormDialog } from "@/components/jobs/job-form";
import { PageHeader } from "@/components/page-header";
import { ReminderFormDialog } from "@/components/reminders/reminder-form";
import { ResearchFormDialog } from "@/components/research/research-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth";
import { statusLabel, statusMeta } from "@/lib/enums";
import { dateChipParts, daysFromToday, dueLabel, formatDateOnly, formatDateTime, localToday } from "@/lib/format";
import { keys } from "@/lib/keys";
import { entityHref } from "@/lib/navigation";
import type { Activity, Analytics, DashboardSummary, Deadline, Paginated, Reminder, StatusCount } from "@/lib/types";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

type StatCard = { key: keyof DashboardSummary; label: string; hint: string; icon: LucideIcon };

const MAIN_CARDS: StatCard[] = [
  { key: "total_jobs", label: "Total job applications", hint: "All jobs you track", icon: Briefcase },
  { key: "total_research", label: "Total research opportunities", hint: "All opportunities you track", icon: FlaskConical },
  { key: "in_progress", label: "Applications in progress", hint: "Preparing, applied, assessment or interview", icon: Hourglass },
  { key: "interviews_scheduled", label: "Interviews scheduled", hint: "Jobs with an interview in the future", icon: MessagesSquare },
];

const COMPACT_CARDS: StatCard[] = [
  { key: "offers", label: "Offers received", hint: "Job offers and accepted research", icon: Trophy },
  { key: "rejected", label: "Rejected applications", hint: "Jobs and research rejected", icon: CircleX },
  { key: "upcoming_deadlines", label: "Upcoming deadlines", hint: "Due in the next 14 days, with reminders", icon: CalendarClock },
  { key: "pending_follow_ups", label: "Pending follow-ups", hint: "Overdue or due in the next 7 days", icon: Reply },
];

function SummarySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {MAIN_CARDS.map((c) => (
          <Skeleton key={c.key} className="h-36 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {COMPACT_CARDS.map((c) => (
          <Skeleton key={c.key} className="h-20 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function SummaryCards() {
  // The browser's date, so "due today" means today where the user is (the API only knows UTC).
  const today = localToday();
  const query = useQuery({
    queryKey: keys.dashboardPart("summary", today),
    queryFn: () => api<DashboardSummary>("/dashboard/summary", { query: { today } }),
  });
  return (
    <DataState query={query} isEmpty={() => false} skeleton={<SummarySkeleton />}>
      {(data) => (
        <div className="space-y-4">
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {MAIN_CARDS.map((c) => (
              <li key={c.key}>
                <Card className="h-full">
                  <CardContent>
                    <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <c.icon className="size-4" aria-hidden="true" />
                    </span>
                    <p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums" data-testid={`card-${c.key}`}>
                      {data[c.key]}
                    </p>
                    <p className="mt-1 text-sm font-medium">{c.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{c.hint}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {COMPACT_CARDS.map((c) => (
              <li key={c.key} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-2xl border bg-card p-4 shadow-card sm:flex-nowrap">
                <c.icon className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="min-w-5 shrink-0 text-xl leading-6 font-semibold tabular-nums" data-testid={`card-${c.key}`}>
                  {data[c.key]}
                </p>
                <div className="w-full min-w-0 sm:w-auto">
                  <p className="text-sm leading-6 font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.hint}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DataState>
  );
}

function Pipeline({ title, icon: Icon, counts, basePath }: { title: string; icon: LucideIcon; counts: StatusCount[]; basePath: string }) {
  const filled = counts.filter((c) => c.count > 0);
  const summary = filled.length > 0 ? filled.map((c) => `${statusLabel(c.status)} ${c.count}`).join(", ") : "nothing yet";
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Icon aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div role="img" aria-label={`${title}: ${summary}`} className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted">
          {filled.map((c) => (
            <span key={c.status} className={statusMeta(c.status).dot} style={{ flexGrow: c.count, flexBasis: 0 }} />
          ))}
        </div>
        <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {counts.map((c) => (
            <li key={c.status}>
              <Link
                href={`${basePath}?status=${c.status}`}
                aria-label={`${statusLabel(c.status)}: ${c.count}. Show in list`}
                className="-mx-2 flex min-h-10 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors hover:bg-muted"
              >
                <span className={cn("size-2.5 shrink-0 rounded-full", statusMeta(c.status).dot)} aria-hidden="true" />
                <span className={cn("min-w-0 flex-1 truncate", c.count === 0 && "text-muted-foreground")}>{statusLabel(c.status)}</span>
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
    <div className="min-w-0 lg:col-span-2">
      <DataState query={query} isEmpty={() => false}>
        {(data) => (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Pipeline title="Job pipeline" icon={Briefcase} counts={data.job_status} basePath="/jobs" />
            <Pipeline title="Research pipeline" icon={FlaskConical} counts={data.research_status} basePath="/research" />
          </div>
        )}
      </DataState>
    </div>
  );
}

const KIND_LABEL: Record<Deadline["kind"], string> = { job_deadline: "Job deadline", research_deadline: "Research deadline", reminder: "Reminder" };
const KIND_ICON: Record<Deadline["kind"], LucideIcon> = { job_deadline: Briefcase, research_deadline: FlaskConical, reminder: Bell };

function deadlineHref(d: Deadline): string {
  if (d.kind === "job_deadline") return entityHref("job", d.id);
  if (d.kind === "research_deadline") return entityHref("research", d.id);
  return "/reminders";
}

/** A month and day tile, tinted by how soon it is. The tile repeats the date beside it, so it is hidden from screen readers. */
function DateChip({ value, className }: { value: string; className: string }) {
  const { month, day } = dateChipParts(value);
  return (
    <span aria-hidden="true" className={cn("flex size-11 shrink-0 flex-col items-center justify-center rounded-xl leading-none", className)}>
      <span className="text-[0.6875rem] font-medium">{month}</span>
      <span className="mt-0.5 text-base font-semibold tabular-nums">{day}</span>
    </span>
  );
}

const SOON = { urgent: "bg-tone-amber-soft text-tone-amber-fg", near: "bg-tone-blue-soft text-tone-blue-fg", later: "bg-muted text-muted-foreground", late: "bg-destructive-soft text-destructive" };

function Deadlines() {
  const today = localToday();
  const query = useQuery({
    queryKey: keys.dashboardPart("deadlines", today),
    queryFn: () => api<Deadline[]>("/dashboard/upcoming-deadlines", { query: { today } }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <CalendarClock aria-hidden="true" />
          Upcoming deadlines
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataState query={query} empty={<p className="text-sm text-muted-foreground">Nothing due in the next 14 days. Deadlines on active jobs and research, and your reminders, show up here.</p>}>
          {(items) => (
            <ul className="-my-1 divide-y">
              {items.map((d) => {
                const days = daysFromToday(d.due);
                const late = days < 0 || (d.kind === "reminder" && new Date(d.due).getTime() < Date.now());
                const soon = late ? SOON.late : days <= 1 ? SOON.urgent : days <= 7 ? SOON.near : SOON.later;
                const KindIcon = KIND_ICON[d.kind];
                return (
                  <li key={`${d.kind}-${d.id}`}>
                    <Link href={deadlineHref(d)} className="-mx-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-3 transition-colors hover:bg-muted sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                      <DateChip value={d.due} className={soon} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-words">{d.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                          <KindIcon className="size-3.5 shrink-0" aria-hidden="true" />
                          <span>{KIND_LABEL[d.kind]}</span>
                          <span aria-hidden="true">·</span>
                          <span>{d.kind === "reminder" ? formatDateTime(d.due) : formatDateOnly(d.due)}</span>
                        </p>
                      </div>
                      <span className={cn("col-start-2 w-fit rounded-full px-2.5 py-0.5 text-xs font-medium sm:col-start-3 sm:row-start-1", soon)}>{late && days === 0 ? "Overdue" : dueLabel(days)}</span>
                    </Link>
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
  if (query.isError && !query.data) {
    return (
      <div className="min-w-0 lg:col-span-2">
        <DataState query={query}>{() => null}</DataState>
      </div>
    );
  }
  const data = query.data;
  if (!data || data.total === 0) return null;
  return (
    <Card data-testid="overdue-section" className="border-destructive/50 lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-destructive [&>svg]:text-destructive">
          <TriangleAlert aria-hidden="true" />
          Overdue ({data.total})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="-my-1 divide-y">
          {data.items.map((r) => (
            <li key={r.id}>
              <Link href={OVERDUE_HREF} className="-mx-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-3 transition-colors hover:bg-muted sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                <DateChip value={r.due_at} className={SOON.late} />
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{r.title}</p>
                  <p className="text-xs text-destructive">Was due {formatDateTime(r.due_at)}</p>
                </div>
                <Badge variant="destructive" className="col-start-2 sm:col-start-3 sm:row-start-1">
                  Overdue
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
        <Link href={OVERDUE_HREF} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-link underline-offset-4 hover:underline">
          {data.total > OVERDUE_SHOWN ? `View all ${data.total} overdue reminders` : "View in reminders"}
          <ArrowRight className="size-4" aria-hidden="true" />
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
        <CardTitle>
          <History aria-hidden="true" />
          Recent activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataState
          query={query}
          empty={
            <EmptyState
              icon={History}
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
            <ul>
              {items.map((a, i) => {
                const label = typeof a.metadata.label === "string" ? a.metadata.label : null;
                const text = (
                  <>
                    <span className="text-sm font-medium break-words">{label ?? "Item"}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {describeActivity(a)} · {formatDateTime(a.created_at)}
                    </span>
                  </>
                );
                // A deleted item has no page to open. Older events for an item deleted later may still land on "not found".
                return (
                  <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < items.length - 1 ? <span className="absolute top-8 bottom-0 left-3.75 w-px bg-border" aria-hidden="true" /> : null}
                    <ActivityIcon action={a.action} />
                    <div className="min-w-0 flex-1">
                      {a.action === "deleted" ? <div>{text}</div> : <Link href={entityHref(a.entity_type, a.entity_id)} className="block min-h-10 rounded-md hover:underline">{text}</Link>}
                    </div>
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

// When the page is one column, what is due comes first. The order is in the DOM, not CSS `order`,
// so tab order and screen readers follow what is on screen at every width.
const DESKTOP_ORDER = ["pipelines", "overdue", "deadlines", "activity"] as const;
const STACKED_ORDER = ["overdue", "deadlines", "pipelines", "activity"] as const;

/** Quiet on desktop. Below that the actions stack, so they need a border to read as buttons. */
const SECONDARY_ACTION = "max-lg:border-border max-lg:bg-card max-lg:hover:bg-muted";

export default function DashboardPage() {
  const user = useCurrentUser();
  const [adding, setAdding] = useState<"job" | "research" | "contact" | "reminder" | null>(null);
  const close = (open: boolean) => !open && setAdding(null);
  const isDesktop = useMediaQuery("(min-width: 64rem)", true);
  const sections: Record<(typeof DESKTOP_ORDER)[number], ReactNode> = {
    pipelines: <Pipelines />,
    overdue: <OverdueReminders />,
    deadlines: <Deadlines />,
    activity: <RecentActivity onAddJob={() => setAdding("job")} />,
  };

  return (
    <>
      <PageHeader
        title={user.data ? `Welcome, ${user.data.full_name.split(" ")[0]}` : "Welcome"}
        description="Your pipeline at a glance."
        icon={LayoutDashboard}
        actions={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:justify-end">
            <Button onClick={() => setAdding("job")}>
              <Briefcase data-icon="inline-start" />
              Add job
            </Button>
            <Button variant="ghost" className={SECONDARY_ACTION} onClick={() => setAdding("research")}>
              <FlaskConical data-icon="inline-start" />
              Add research
            </Button>
            <Button variant="ghost" className={SECONDARY_ACTION} onClick={() => setAdding("contact")}>
              <Contact data-icon="inline-start" />
              Add contact
            </Button>
            <Button variant="ghost" className={SECONDARY_ACTION} onClick={() => setAdding("reminder")}>
              <BellPlus data-icon="inline-start" />
              Add reminder
            </Button>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0 lg:col-span-2">
          <SummaryCards />
        </div>
        {(isDesktop ? DESKTOP_ORDER : STACKED_ORDER).map((key) => (
          <Fragment key={key}>{sections[key]}</Fragment>
        ))}
      </div>
      <JobFormDialog open={adding === "job"} onOpenChange={close} />
      <ResearchFormDialog open={adding === "research"} onOpenChange={close} />
      <ContactFormDialog open={adding === "contact"} onOpenChange={close} />
      <ReminderFormDialog open={adding === "reminder"} onOpenChange={close} />
    </>
  );
}
