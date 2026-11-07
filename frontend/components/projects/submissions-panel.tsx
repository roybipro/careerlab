"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataState } from "@/components/data-state";
import { NativeSelect } from "@/components/native-select";
import { SubmissionFormDialog } from "@/components/projects/submission-form";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { SUBMISSION_STATUSES, VENUE_TYPES, optionLabel } from "@/lib/enums";
import { daysFromToday, dueLabel, formatDateOnly, safeHttpUrl } from "@/lib/format";
import { invalidateProject, keys } from "@/lib/keys";
import type { Paginated, ProjectSubmission } from "@/lib/types";
import { cn } from "@/lib/utils";

const WRAP = "[overflow-wrap:anywhere]";

/** A labelled plain date. A deadline of a planned submission also says how soon it is. */
function DateLine({ label, value, countdown }: { label: string; value: string | null; countdown?: boolean }) {
  if (!value) return null;
  const days = countdown ? daysFromToday(value) : null;
  const late = days !== null && days < 0;
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{formatDateOnly(value)}</dd>
      {days !== null ? <dd className={cn("text-xs", late ? "font-medium text-destructive" : "text-muted-foreground")}>({dueLabel(days)})</dd> : null}
    </div>
  );
}

function SubmissionRow({ projectId, submission, onEdit, onDelete }: { projectId: string; submission: ProjectSubmission; onEdit: () => void; onDelete: () => void }) {
  const client = useQueryClient();
  const href = safeHttpUrl(submission.venue_url);
  // Deadlines stop counting once the submission leaves "planned".
  const planned = submission.status === "planned";

  const changeStatus = useMutation({
    mutationFn: (status: string) => api<ProjectSubmission>(`/projects/${projectId}/submissions/${submission.id}`, { method: "PATCH", body: { status } }),
    onError: (e) => toast.error(`Could not change the status. ${e instanceof ApiError ? e.message : "Something went wrong."}`),
    // Success or failure, ask again: the row, the project's activity and the dashboard all follow the server.
    onSettled: () => invalidateProject(client, projectId),
  });

  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium", WRAP)}>
            {submission.venue_name}
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open the ${submission.venue_name} website`} className="ml-1.5 inline-block align-middle text-link">
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">{optionLabel(VENUE_TYPES, submission.venue_type)}</p>
          {submission.venue_url && !href ? <p className={cn("text-xs text-muted-foreground", WRAP)}>{submission.venue_url}</p> : null}
        </div>
        <StatusBadge status={submission.status} />
      </div>

      <dl className="space-y-1 text-sm">
        <DateLine label="Abstract deadline" value={submission.abstract_deadline} countdown={planned} />
        <DateLine label="Paper deadline" value={submission.paper_deadline} countdown={planned} />
        <DateLine label="Submitted on" value={submission.submitted_on} />
        <DateLine label="Notification" value={submission.notification_date} />
      </dl>

      {submission.feedback ? (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground">Feedback</h4>
          {/* Rendered as text, never as markup; line breaks are kept. */}
          <p className={cn("mt-0.5 text-sm whitespace-pre-wrap", WRAP)}>{submission.feedback}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-52">
          <NativeSelect
            label={`Status of ${submission.venue_name}`}
            hideLabel
            options={SUBMISSION_STATUSES}
            value={submission.status}
            disabled={changeStatus.isPending}
            onChange={(e) => changeStatus.mutate(e.target.value)}
          />
        </div>
        <Button variant="outline" size="sm" onClick={onEdit} aria-label={`Edit ${submission.venue_name}`}>
          <Pencil data-icon="inline-start" />
          Edit
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive-soft hover:text-destructive" onClick={onDelete} aria-label={`Delete ${submission.venue_name}`}>
          <Trash2 data-icon="inline-start" />
          Delete
        </Button>
      </div>
    </li>
  );
}

/** The venues a project is sent to, one row each, with add, edit, status change and delete. */
export function SubmissionsPanel({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: keys.projectSubmissions(projectId),
    queryFn: () => api<Paginated<ProjectSubmission>>(`/projects/${projectId}/submissions`, { query: { page_size: 100 } }),
  });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ProjectSubmission | null>(null);
  const [deleting, setDeleting] = useState<ProjectSubmission | null>(null);

  const remove = useMutation({
    mutationFn: (s: ProjectSubmission) => api<void>(`/projects/${projectId}/submissions/${s.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setDeleting(null);
      await invalidateProject(client, projectId);
      toast.success("Submission deleted");
    },
    onError: (e) => {
      setDeleting(null);
      toast.error(e instanceof ApiError ? e.message : "Could not delete the submission.");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Send aria-hidden="true" />
          Submissions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus data-icon="inline-start" />
          Add submission
        </Button>
        <DataState query={query} empty={<p className="text-sm text-muted-foreground">No submissions yet. Add a conference, journal or workshop you plan to send this project to.</p>}>
          {(data) => (
            <ul className="divide-y">
              {data.items.map((s) => (
                <SubmissionRow key={s.id} projectId={projectId} submission={s} onEdit={() => setEditing(s)} onDelete={() => setDeleting(s)} />
              ))}
            </ul>
          )}
        </DataState>
      </CardContent>
      <SubmissionFormDialog open={adding} onOpenChange={setAdding} projectId={projectId} />
      {editing ? <SubmissionFormDialog open onOpenChange={(open) => !open && setEditing(null)} projectId={projectId} submission={editing} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete the ${deleting?.venue_name ?? ""} submission?`}
        description="This cannot be undone."
        confirmLabel="Delete submission"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Card>
  );
}
