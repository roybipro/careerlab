"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bell } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { keys } from "@/lib/keys";
import type { Paginated, Reminder } from "@/lib/types";

const SHOWN = 8;

/**
 * Incomplete reminders that are overdue or due within 3 days. `due_within_days` has no lower
 * bound on the API side, so overdue reminders are included, and completed ones never are.
 */
export function ReminderBell() {
  const query = useQuery({
    queryKey: keys.reminderBell,
    queryFn: () => api<Paginated<Reminder>>("/reminders", { query: { due_within_days: 3, sort: "due_at", page_size: SHOWN } }),
    // Alerts are computed when asked for: look again every minute and when the tab regains focus.
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
  const total = query.data?.total ?? 0;
  // Overdue is judged at the moment the list was fetched.
  const now = query.dataUpdatedAt;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" aria-label={total > 0 ? `Reminders: ${total} overdue or due soon` : "Reminders: none due soon"} />
        }
      >
        <Bell />
        {total > 0 ? (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive-solid px-1 text-[10px] leading-none font-semibold text-white" aria-hidden="true">
            {total > 99 ? "99+" : total}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Overdue or due in the next 3 days</DropdownMenuLabel>
        </DropdownMenuGroup>
        {query.isError && !query.data ? (
          <div className="px-2 py-2 text-sm text-muted-foreground">
            Could not load reminders.{" "}
            <button type="button" className="min-h-10 text-link underline underline-offset-4 md:min-h-0" onClick={() => void query.refetch()}>
              Retry
            </button>
          </div>
        ) : query.isPending ? (
          <div className="px-2 py-2 text-sm text-muted-foreground">Loading...</div>
        ) : total === 0 ? (
          <div className="px-2 py-2 text-sm text-muted-foreground">Nothing is due soon.</div>
        ) : (
          query.data?.items.map((r) => {
            const overdue = new Date(r.due_at).getTime() < now;
            return (
              <DropdownMenuItem key={r.id} render={<Link href={overdue ? "/reminders?state=overdue" : "/reminders"} />} className="flex-col items-start gap-0.5">
                <span className="w-full truncate text-sm font-medium">{r.title}</span>
                <span className={overdue ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                  {overdue ? "Overdue, " : "Due "}
                  {formatDateTime(r.due_at)}
                </span>
              </DropdownMenuItem>
            );
          })
        )}
        {total > SHOWN ? <div className="px-2 py-1 text-xs text-muted-foreground">and {total - SHOWN} more</div> : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/reminders" />}>
          <ArrowRight aria-hidden="true" />
          View all reminders</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
