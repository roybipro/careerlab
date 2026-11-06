"use client";

import { useQuery } from "@tanstack/react-query";
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
    case "archived":
      return "Archived";
    case "deleted":
      return "Deleted";
    default:
      return humanize(a.action);
  }
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
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <DataState query={query} empty={<p className="text-sm text-muted-foreground">No activity yet.</p>}>
          {(data) => (
            <>
              <ol className="space-y-3 border-l pl-4">
                {data.items.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-border" aria-hidden="true" />
                    <p className="text-sm">{describeActivity(a)}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</p>
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
