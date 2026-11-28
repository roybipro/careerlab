"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";

const ENDPOINT = "/notifications/email";
const KEY = ["notifications", "email"] as const;

type EmailSettings = { enabled: boolean; available: boolean };

/** The ?email= notice the unsubscribe link lands on. */
const NOTICE: Record<string, { text: string; error?: boolean }> = {
  unsubscribed: { text: "You are unsubscribed. The daily digest is off until you turn it on again." },
  "invalid-link": { text: "That unsubscribe link did not work. You can turn the digest off here instead.", error: true },
};

/** The opt-in daily email: what is overdue, what is due this week, and what needs a follow-up. */
export function EmailDigest() {
  const client = useQueryClient();
  const notice = NOTICE[useSearchParams().get("email") ?? ""];
  const query = useQuery({ queryKey: KEY, queryFn: () => api<EmailSettings>(ENDPOINT) });

  const save = useMutation({
    mutationFn: (enabled: boolean) => api<EmailSettings>(ENDPOINT, { method: "PUT", body: { enabled } }),
    onSuccess: (data) => {
      client.setQueryData(KEY, data);
      toast.success(data.enabled ? "Daily digest on" : "Daily digest off");
    },
    onError: (e) => toast.error(`Could not save. ${e instanceof ApiError ? e.message : "Something went wrong."}`),
  });

  const data = query.data;
  const checked = save.isPending ? (save.variables ?? false) : (data?.enabled ?? false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Mail aria-hidden="true" />
          Daily email digest
        </CardTitle>
        <CardDescription>
          One email in the morning (07:00 UTC) with what is overdue, what is due in the next week and what is worth a follow-up. Nothing is
          sent on days with nothing in it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notice ? (
          <Alert variant={notice.error ? "destructive" : "default"}>
            <AlertDescription>{notice.text}</AlertDescription>
          </Alert>
        ) : null}
        {query.isPending ? (
          <Skeleton className="h-6 w-64" />
        ) : query.isError ? (
          <p className="text-sm text-destructive">Could not load the email settings.</p>
        ) : !data?.available && !data?.enabled ? (
          <p className="text-sm text-muted-foreground">Email is not set up on this server yet, so the digest cannot be turned on.</p>
        ) : (
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              role="switch"
              className="peer sr-only"
              checked={checked}
              disabled={save.isPending}
              onChange={(e) => save.mutate(e.currentTarget.checked)}
            />
            {/* A switch drawn over the real checkbox, which keeps keyboard and screen reader support. */}
            <span
              aria-hidden="true"
              className="relative h-6 w-10 shrink-0 rounded-full bg-input transition-colors peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:opacity-60 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4"
            />
            <span>Email me a daily digest</span>
          </label>
        )}
      </CardContent>
    </Card>
  );
}
