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
  FileUp,
  FlaskConical,
  FolderKanban,
  History,
  Hourglass,
  LayoutDashboard,
  ListChecks,
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
import type { Activity, Analytics, DashboardSummary, Deadline, OverdueResearch, Paginated, Reminder, StatusCount } from "@/lib/types";
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
  { key: "upcoming_deadlines", label: "Upcoming deadlines", hint: "Due in the next 14 days, with reminders and research items", icon: CalendarClock },
  { key: "pending_follow_ups", label: "Pending follow-ups", hint: "Overdue or due in the next 7 days", icon: Reply },
  { key: "active_research_projects", label: "Active research projects", hint: "Not published or paused", icon: FolderKanban },
];

function SummarySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {MAIN_CARDS.map((c) => (
          <Skeleton key={c.key} className="h-36 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
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
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-5">
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

type ItemKind = Deadline["kind"];

const KIND_LABEL: Record<ItemKind, string> = {
  job_deadline: "Job deadline",
  research_deadline: "Research deadline",
  reminder: "Reminder",
  project_submission_deadline: "Submission deadline",
  project_milestone: "Milestone",
};
const KIND_ICON: Record<ItemKind, LucideIcon> = {
  job_deadline: Briefcase,
  research_deadline: FlaskConical,
  reminder: Bell,
  project_submission_deadline: FileUp,
  project_milestone: ListChecks,
};

function deadlineHref(d: Deadline): string {
  if (d.kind === "job_deadline") return entityHref("job", d.id);
  if (d.kind === "research_deadline") return entityHref("research", d.id);
  // Both research project kinds open the project, not the submission or milestone.
  if ((d.kind === "project_submission_deadline" || d.kind === "project_milestone") && d.project_id) return entityHref("project", d.project_id);
  return "/reminders";
}

/** Where an item is from, for project items: "Kind · Project name". Other kinds show the kind alone. */
function ProjectName({ name }: { name: string | null | undefined }) {
  if (!name) return null;
  return (
    <>
      <span aria-hidden="true">·</span>
      <span className="font-medium text-foreground [overflow-wrap:anywhere]">{name}</span>
    </>
  );
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
                  <li key={`${d.kind}-${d.id}-${d.title}`}>
                    <Link href={deadlineHref(d)} className="-mx-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-3 transition-colors hover:bg-muted sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                      <DateChip value={d.due} className={soon} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-words">{d.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                          <KindIcon className="size-3.5 shrink-0" aria-hidden="true" />
                          <span>{KIND_LABEL[d.kind]}</span>
                          <ProjectName name={d.project_title} />
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

type OverdueRow = {
  key: string;
  href: string;
  title: string;
  kind: ItemKind;
  /** Project name, for research items. */
  project: string | null;
  /** The chip date and the "was due" text. */
  due: string;
  /** Sort key: when it fell due, in the browser's time zone. A plain date counts from local midnight. */
  at: number;
};

/** A plain date as the start of that day, without any time zone shift of the date itself. */
function dayStart(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Incomplete reminders and open research items already past due, oldest first. Shows nothing at all when there are none. */
function OverdueItems() {
  const today = localToday();
  const reminders = useQuery({
    queryKey: keys.dashboardPart("overdue"),
    queryFn: () => api<Paginated<Reminder>>("/reminders", { query: { state: "overdue", sort: "due_at", page_size: OVERDUE_SHOWN } }),
    // Overdue is judged when the list is fetched, so look again every minute.
    refetchInterval: 60_000,
  });
  const research = useQuery({
    queryKey: keys.dashboardPart("overdue-research", today),
    queryFn: () => api<OverdueResearch[]>("/dashboard/overdue-research", { query: { today } }),
    refetchInterval: 60_000,
  });
  if (reminders.isPending || research.isPending) return null;
  if (!reminders.data && !research.data) {
    return (
      <div className="min-w-0 lg:col-span-2">
        {reminders.isError ? <DataState query={reminders}>{() => null}</DataState> : <DataState query={research}>{() => null}</DataState>}
      </div>
    );
  }
  const reminderRows: OverdueRow[] = (reminders.data?.items ?? []).map((r) => ({
    key: `reminder-${r.id}`,
    href: OVERDUE_HREF,
    title: r.title,
    kind: "reminder",
    project: null,
    due: r.due_at,
    at: new Date(r.due_at).getTime(),
  }));
  const researchRows: OverdueRow[] = (research.data ?? []).map((i) => ({
    key: `${i.kind}-${i.id}-${i.title}`,
    href: entityHref("project", i.project_id),
    title: i.title,
    kind: i.kind,
    project: i.project_title,
    due: i.due,
    at: dayStart(i.due),
  }));
  // The API caps the research list at 50, so its length is the count it can show.
  const reminderTotal = reminders.data?.total ?? 0;
  const total = reminderTotal + researchRows.length;
  if (total === 0) return null;
  const rows = [...reminderRows, ...researchRows].sort((a, b) => a.at - b.at).slice(0, OVERDUE_SHOWN);
  const failed = reminders.isError ? "reminders" : research.isError ? "research items" : null;

  return (
    <Card data-testid="overdue-section" className="border-destructive/50 lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-destructive [&>svg]:text-destructive">
          <TriangleAlert aria-hidden="true" />
          Overdue ({total})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {failed ? (
          <p role="alert" className="text-sm text-destructive">
            Could not refresh overdue {failed}. Showing the last loaded list.
          </p>
        ) : null}
        <ul className="-my-1 divide-y">
          {rows.map((r) => {
            const KindIcon = KIND_ICON[r.kind];
            return (
              <li key={r.key}>
                <Link href={r.href} className="-mx-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-3 transition-colors hover:bg-muted sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                  <DateChip value={r.due} className={SOON.late} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{r.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                      <KindIcon className="size-3.5 shrink-0" aria-hidden="true" />
                      <span>{KIND_LABEL[r.kind]}</span>
                      <ProjectName name={r.project} />
                    </p>
                    <p className="text-xs text-destructive">Was due {r.kind === "reminder" ? formatDateTime(r.due) : formatDateOnly(r.due)}</p>
                  </div>
                  <Badge variant="destructive" className="col-start-2 sm:col-start-3 sm:row-start-1">
                    Overdue
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
        {reminderTotal > 0 ? (
          <Link href={OVERDUE_HREF} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-link underline-offset-4 hover:underline">
            {reminderTotal > OVERDUE_SHOWN ? `View all ${reminderTotal} overdue reminders` : "View in reminders"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
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
    overdue: <OverdueItems />,
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
