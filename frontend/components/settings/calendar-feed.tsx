"use client";

import { CalendarDays, Check, Copy } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";

const FEED = "/calendar/feed";
const FEED_KEY = ["calendar", "feed"] as const;

type FeedStatus = { enabled: boolean };
type FeedCreated = { enabled: true; path: string };

const errorText = (e: Error) => (e instanceof ApiError ? e.message : "Something went wrong.");

/**
 * A private link that calendar apps subscribe to, listing deadlines, interviews, milestones and
 * reminders. Only a hash of the link is stored, so it is shown once, right after it is made;
 * resetting makes a new one and stops the old one.
 */
export function CalendarFeed() {
  const client = useQueryClient();
  const status = useQuery({ queryKey: FEED_KEY, queryFn: () => api<FeedStatus>(FEED) });
  // The full link, only in this tab and only until the page is left.
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<"reset" | "off" | null>(null);

  const create = useMutation({
    mutationFn: () => api<FeedCreated>(FEED, { method: "POST" }),
    onSuccess: (data) => {
      setUrl(`${window.location.origin}${data.path}`);
      setCopied(false);
      client.setQueryData<FeedStatus>(FEED_KEY, { enabled: true });
      setConfirm(null);
    },
    onError: (e) => toast.error(`Could not make a calendar link. ${errorText(e)}`),
  });

  const disable = useMutation({
    mutationFn: () => api<void>(FEED, { method: "DELETE" }),
    onSuccess: () => {
      setUrl(null);
      client.setQueryData<FeedStatus>(FEED_KEY, { enabled: false });
      setConfirm(null);
      toast.success("Calendar link turned off");
    },
    onError: (e) => toast.error(`Could not turn off the calendar link. ${errorText(e)}`),
  });

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      toast.error("Could not copy. Select the link and copy it instead.");
    }
  }

  const enabled = status.data?.enabled ?? false;
  const busy = create.isPending || disable.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <CalendarDays aria-hidden="true" />
          Calendar subscription
        </CardTitle>
        <CardDescription>
          See deadlines, interviews, follow-ups, milestones and reminders in Google Calendar, Apple Calendar or Outlook. Only open work is
          included, and it updates on its own.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isPending ? (
          <Skeleton className="h-10 w-48" />
        ) : status.isError ? (
          <p className="text-sm text-destructive">Could not load the calendar settings. {errorText(status.error)}</p>
        ) : url ? (
          <>
            <div className="space-y-2">
              <label htmlFor="calendar-url" className="text-sm font-medium">
                Your private calendar link
              </label>
              <div className="flex gap-2">
                <input
                  id="calendar-url"
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-10 min-w-0 flex-1 rounded-md border border-input bg-field px-3 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9"
                />
                <Button variant="outline" onClick={copy} className="gap-1.5">
                  {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground" role="note">
                Copy it now: for your security it is not shown again. Anyone with the link can see these dates, so keep it private.
              </p>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                <strong className="font-medium text-foreground">Google Calendar:</strong> Other calendars, then <em>+</em>, then From URL. Google
                refreshes it every few hours.
              </li>
              <li>
                <strong className="font-medium text-foreground">Apple Calendar:</strong>{" "}
                <a className="text-link underline-offset-4 hover:underline" href={url.replace(/^https?:/, "webcal:")}>
                  open the link in Calendar
                </a>
                , or File, then New Calendar Subscription.
              </li>
              <li>
                <strong className="font-medium text-foreground">Outlook:</strong> Add calendar, then Subscribe from web.
              </li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setConfirm("off")} disabled={busy}>
                Turn off
              </Button>
            </div>
          </>
        ) : enabled ? (
          <>
            <p className="text-sm text-muted-foreground">
              Your calendar link is on. It was shown once when you made it; if you no longer have it, reset it to get a new one.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setConfirm("reset")} disabled={busy}>
                Reset link
              </Button>
              <Button variant="outline" onClick={() => setConfirm("off")} disabled={busy}>
                Turn off
              </Button>
            </div>
          </>
        ) : (
          <Button onClick={() => create.mutate()} disabled={busy}>
            {create.isPending ? "Making link..." : "Make calendar link"}
          </Button>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm === "reset" ? "Reset the calendar link?" : "Turn off the calendar link?"}
        description={
          confirm === "reset"
            ? "The old link stops working, so calendars subscribed to it stop updating. You get a new link to add again."
            : "The link stops working, so calendars subscribed to it stop updating. You can make a new one later."
        }
        confirmLabel={confirm === "reset" ? "Reset link" : "Turn off"}
        pending={busy}
        onConfirm={() => (confirm === "reset" ? create.mutate() : disable.mutate())}
      />
    </Card>
  );
}
