"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClockOff, Briefcase, Contact, FlaskConical, MessageCircleReply, UserCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { localToday } from "@/lib/format";
import { invalidateContacts, keys } from "@/lib/keys";
import { entityHref } from "@/lib/navigation";
import type { Nudge } from "@/lib/types";

const ICON: Record<Nudge["kind"], LucideIcon> = { job: Briefcase, research: FlaskConical, contact: Contact };
const SNOOZE_DAYS = 7;

function reasonText(n: Nudge): string {
  if (n.reason === "quiet_contact") return `Last contacted ${n.days} days ago, and linked to open work`;
  return n.kind === "research" ? `No news for ${n.days} days` : `Applied ${n.days} days ago, no reply yet`;
}

/**
 * Open work that has gone quiet: applications waiting two weeks or more for a reply, and
 * contacts on active work not reached in two months. Hidden when there are none.
 */
export function NudgesCard() {
  const client = useQueryClient();
  const today = localToday();
  const queryKey = keys.dashboardPart("nudges", today);
  const query = useQuery({ queryKey, queryFn: () => api<Nudge[]>("/nudges", { query: { today } }) });

  // The row leaves at once; on failure it comes back with a message.
  function hide(n: Nudge) {
    const before = client.getQueryData<Nudge[]>(queryKey);
    client.setQueryData<Nudge[]>(queryKey, (old) => old?.filter((x) => !(x.kind === n.kind && x.id === n.id)));
    return before;
  }
  function failed(before: Nudge[] | undefined, what: string, e: Error) {
    client.setQueryData(queryKey, before);
    toast.error(`Could not ${what}. ${e instanceof ApiError ? e.message : "Something went wrong."}`);
  }

  const snooze = useMutation({
    mutationFn: (n: Nudge) => api<void>("/nudges/snooze", { method: "POST", query: { today }, body: { entity_type: n.kind, entity_id: n.id, days: SNOOZE_DAYS } }),
    onMutate: hide,
    onError: (e, _n, before) => failed(before, "snooze it", e),
    onSuccess: (_d, n) => toast.success(`Snoozed ${n.title} for a week`),
    onSettled: () => client.invalidateQueries({ queryKey: keys.dashboard }),
  });

  const contacted = useMutation({
    mutationFn: (n: Nudge) => api<unknown>(`/contacts/${n.id}`, { method: "PATCH", body: { last_contacted_at: today } }),
    onMutate: hide,
    onError: (e, _n, before) => failed(before, "update the contact", e),
    onSuccess: (_d, n) => toast.success(`Marked ${n.title} as contacted today`),
    onSettled: () => invalidateContacts(client),
  });

  const nudges = query.data ?? [];
  if (nudges.length === 0) return null;

  return (
    <Card data-testid="nudges-section" className="lg:col-span-2">
      <CardHeader>
        <CardTitle>
          <MessageCircleReply aria-hidden="true" />
          Worth a follow-up ({nudges.length})
        </CardTitle>
        <CardDescription>Applications and contacts that have gone quiet. A short check-in often gets things moving.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="-my-1 divide-y">
          {nudges.map((n) => {
            const Icon = ICON[n.kind];
            return (
              <li key={`${n.kind}-${n.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={entityHref(n.kind, n.id)} className="text-sm font-medium break-words underline-offset-4 hover:text-link hover:underline">
                    {n.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">{reasonText(n)}</p>
                </div>
                <div className="flex gap-1 max-sm:w-full max-sm:justify-end">
                  {n.kind === "contact" ? (
                    <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => contacted.mutate(n)} aria-label={`Mark ${n.title} as contacted today`}>
                      <UserCheck className="size-3.5" aria-hidden="true" />
                      Contacted today
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => snooze.mutate(n)} aria-label={`Snooze ${n.title} for a week`}>
                    <AlarmClockOff className="size-3.5" aria-hidden="true" />
                    Snooze a week
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
