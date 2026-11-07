"use client";

import { useQuery } from "@tanstack/react-query";
import { Archive, ArrowRightLeft, CalendarClock, CalendarPlus, Circle, CircleCheck, FileUp, History, Plus, Trash2, UserPlus, type LucideIcon } from "lucide-react";
import { DataState } from "@/components/data-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { humanize, statusLabel, type EntityType } from "@/lib/enums";
import { formatDateOnly, formatDateTime } from "@/lib/format";
import { keys } from "@/lib/keys";
import type { Activity, Paginated } from "@/lib/types";

const PAGE_SIZE = 50;

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** One readable line for an activity event. Unknown actions fall back to the action name. */
export function describeActivity(a: Activity): string {
  const m = a.metadata;
  switch (a.action) {
    case "created":
      return "Created";
    case "status_changed":
      return `Status changed from ${statusLabel(str(m.old) ?? "none")} to ${statusLabel(str(m.new) ?? "none")}`;
    case "deadline_updated": {
      const from = formatDateOnly(str(m.old));
      const to = formatDateOnly(str(m.new));
      return to ? `Deadline ${from ? `changed from ${from} to ${to}` : `set to ${to}`}` : "Deadline removed";
    }
    case "interview_scheduled":
      return `Interview scheduled for ${formatDateTime(str(m.interview_at)) ?? "a new time"}`;
    case "contact_added":
      return `Contact added: ${str(m.contact_name) ?? "a contact"}`;
    case "stage_changed":
      return `Stage changed from ${statusLabel(str(m.old) ?? "none")} to ${statusLabel(str(m.new) ?? "none")}`;
    case "submission_added":
      return `Submission added: ${str(m.venue) ?? "a venue"}`;
    case "submission_status_changed":
      return `${str(m.venue) ?? "Submission"} changed from ${statusLabel(str(m.old) ?? "none")} to ${statusLabel(str(m.new) ?? "none")}`;
    case "milestone_completed":
      return `Milestone completed: ${str(m.milestone) ?? "a milestone"}`;
    case "archived":
      return "Archived";
    case "deleted":
      return "Deleted";
    default:
      return humanize(a.action);
  }
}

const ACTION_ICON: Record<string, LucideIcon> = {
  created: Plus,
  status_changed: ArrowRightLeft,
  stage_changed: ArrowRightLeft,
  submission_added: FileUp,
  submission_status_changed: ArrowRightLeft,
  milestone_completed: CircleCheck,
  deadline_updated: CalendarClock,
  interview_scheduled: CalendarPlus,
  contact_added: UserPlus,
  archived: Archive,
  deleted: Trash2,
};

/** The round icon for one event on a timeline. The text beside it says the same thing. */
export function ActivityIcon({ action }: { action: string }) {
  const Icon = ACTION_ICON[action] ?? Circle;
  return (
    <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

/** Newest-first history of one record. Works for any entity type. */
export function ActivityTimeline({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const query = useQuery({
    queryKey: keys.activity(entityType, entityId),
    queryFn: () =>
      api<Paginated<Activity>>("/activity", {
        query: { entity_type: entityType, entity_id: entityId, page_size: PAGE_SIZE },
      }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <History aria-hidden="true" />
          Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataState query={query} empty={<p className="text-sm text-muted-foreground">No activity yet.</p>}>
          {(data) => (
            <>
              <ol>
                {data.items.map((a, i) => (
                  <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < data.items.length - 1 ? <span className="absolute top-8 bottom-0 left-3.75 w-px bg-border" aria-hidden="true" /> : null}
                    <ActivityIcon action={a.action} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm break-words">{describeActivity(a)}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
              {data.total > data.items.length ? (
                <p className="mt-3 text-xs text-muted-foreground">Showing the latest {data.items.length} of {data.total} events.</p>
              ) : null}
            </>
          )}
        </DataState>
      </CardContent>
    </Card>
  );
}
