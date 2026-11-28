"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock, ExternalLink, MapPin, MessagesSquare, Pencil, Plus, Star, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataState } from "@/components/data-state";
import { InterviewFormDialog } from "@/components/jobs/interview-form";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { INTERVIEW_TYPES, optionLabel } from "@/lib/enums";
import { formatDateTime, safeHttpUrl } from "@/lib/format";
import { invalidateEntity, keys } from "@/lib/keys";
import type { JobInterview } from "@/lib/types";
import { cn } from "@/lib/utils";

const WRAP = "[overflow-wrap:anywhere]";

/** "in 3 days", "today", "2 days ago", from the browser's clock. */
function relative(iso: string, now = Date.now()): string {
  const days = Math.round((new Date(iso).getTime() - now) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("size-3.5", n <= rating ? "fill-tone-amber text-tone-amber" : "text-muted-foreground/40")} aria-hidden="true" />
      ))}
    </span>
  );
}

function InterviewRow({ jobId, interview, isNext, onEdit, onDelete }: { jobId: string; interview: JobInterview; isNext: boolean; onEdit: () => void; onDelete: () => void }) {
  const client = useQueryClient();
  const link = safeHttpUrl(interview.location);
  // The box shows the new value at once and keeps it until the list has the saved one;
  // a failed save puts it back.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const thankYou = useMutation({
    mutationFn: (value: boolean) => api<JobInterview>(`/jobs/${jobId}/interviews/${interview.id}`, { method: "PATCH", body: { thank_you_sent: value } }),
    onError: (e) => toast.error(`Could not save. ${e instanceof ApiError ? e.message : "Something went wrong."}`),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: keys.jobInterviews(jobId) });
      setOptimistic(null);
    },
  });
  const checked = optimistic ?? interview.thank_you_sent;

  return (
    <li className={cn("space-y-2 py-4 first:pt-0 last:pb-0", isNext && "-mx-3 rounded-lg bg-accent/40 px-3 first:pt-3 last:pb-3")}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium", WRAP)}>
            {interview.title}
            {isNext ? <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[0.6875rem] font-medium text-primary-foreground align-middle">Next</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">{optionLabel(INTERVIEW_TYPES, interview.interview_type)}</p>
        </div>
        <StatusBadge status={interview.outcome} />
      </div>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {interview.scheduled_at ? (
          <div className="flex items-center gap-1.5">
            <dt>
              <CalendarClock className="size-3.5 text-muted-foreground" aria-label="When" />
            </dt>
            <dd className="tabular-nums">
              {formatDateTime(interview.scheduled_at)} <span className="text-xs text-muted-foreground">({relative(interview.scheduled_at)})</span>
            </dd>
          </div>
        ) : null}
        {interview.duration_minutes ? (
          <div className="flex items-center gap-1.5">
            <dt>
              <Clock className="size-3.5 text-muted-foreground" aria-label="Length" />
            </dt>
            <dd>{interview.duration_minutes} minutes</dd>
          </div>
        ) : null}
        {interview.location ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <dt>
              <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-label="Where" />
            </dt>
            <dd className={cn("min-w-0", WRAP)}>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link underline-offset-4 hover:underline">
                  Join link
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : (
                interview.location
              )}
            </dd>
          </div>
        ) : null}
        {interview.interviewers ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <dt>
              <Users className="size-3.5 shrink-0 text-muted-foreground" aria-label="Interviewers" />
            </dt>
            <dd className={WRAP}>{interview.interviewers}</dd>
          </div>
        ) : null}
        {interview.rating ? (
          <div className="flex items-center gap-1.5">
            <dt className="text-xs text-muted-foreground">How it went</dt>
            <dd>
              <Stars rating={interview.rating} />
            </dd>
          </div>
        ) : null}
      </dl>

      {interview.questions ? (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground">Questions asked</h4>
          {/* Rendered as text, never as markup; line breaks are kept. */}
          <p className={cn("mt-0.5 text-sm whitespace-pre-wrap", WRAP)}>{interview.questions}</p>
        </div>
      ) : null}
      {interview.notes ? (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground">Notes</h4>
          <p className={cn("mt-0.5 text-sm whitespace-pre-wrap", WRAP)}>{interview.notes}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="mr-auto flex min-h-10 cursor-pointer items-center gap-2 text-sm md:min-h-0">
          <input type="checkbox" className="size-4 accent-primary" checked={checked} disabled={thankYou.isPending} onChange={(e) => {
              const value = e.currentTarget.checked;
              setOptimistic(value);
              thankYou.mutate(value);
            }} />
          Thank-you note sent
        </label>
        <Button variant="outline" size="sm" onClick={onEdit} aria-label={`Edit ${interview.title}`}>
          <Pencil data-icon="inline-start" />
          Edit
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive-soft hover:text-destructive" onClick={onDelete} aria-label={`Delete ${interview.title}`}>
          <Trash2 data-icon="inline-start" />
          Delete
        </Button>
      </div>
    </li>
  );
}

/** The interview rounds of a job, in date order, with the next upcoming one marked. */
export function InterviewsPanel({ jobId }: { jobId: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: keys.jobInterviews(jobId), queryFn: () => api<JobInterview[]>(`/jobs/${jobId}/interviews`) });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<JobInterview | null>(null);
  const [deleting, setDeleting] = useState<JobInterview | null>(null);

  const remove = useMutation({
    mutationFn: (i: JobInterview) => api<void>(`/jobs/${jobId}/interviews/${i.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setDeleting(null);
      await invalidateEntity(client, "job", jobId);
      toast.success("Interview deleted");
    },
    onError: (e) => {
      setDeleting(null);
      toast.error(e instanceof ApiError ? e.message : "Could not delete the interview.");
    },
  });

  // Read once when the panel opens: which round is next does not need to tick.
  const [now] = useState(() => Date.now());
  const next = query.data?.find((i) => i.outcome === "pending" && i.scheduled_at && new Date(i.scheduled_at).getTime() >= now);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <MessagesSquare aria-hidden="true" />
          Interviews
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus data-icon="inline-start" />
          Add interview
        </Button>
        <DataState query={query} isEmpty={(d) => d.length === 0} empty={<p className="text-sm text-muted-foreground">No interviews yet. Add each round as it is booked: the date goes on your calendar feed, and you can note the questions and how it went.</p>}>
          {(data) => (
            <ul className="divide-y">
              {data.map((i) => (
                <InterviewRow key={i.id} jobId={jobId} interview={i} isNext={i.id === next?.id} onEdit={() => setEditing(i)} onDelete={() => setDeleting(i)} />
              ))}
            </ul>
          )}
        </DataState>
      </CardContent>
      <InterviewFormDialog open={adding} onOpenChange={setAdding} jobId={jobId} />
      {editing ? <InterviewFormDialog open onOpenChange={(open) => !open && setEditing(null)} jobId={jobId} interview={editing} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete the ${deleting?.title ?? ""} interview?`}
        description="Its notes and questions are deleted too. This cannot be undone."
        confirmLabel="Delete interview"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Card>
  );
}
