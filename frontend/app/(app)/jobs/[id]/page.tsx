"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataSkeleton, DataState, EmptyState } from "@/components/data-state";
import { ActivityTimeline } from "@/components/entity/activity-timeline";
import { LinkedContacts } from "@/components/entity/linked-contacts";
import { NotesPanel } from "@/components/entity/notes-panel";
import { RemindersPanel } from "@/components/entity/reminders-panel";
import { JobFormDialog } from "@/components/jobs/job-form";
import { PageHeader } from "@/components/page-header";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { EMPLOYMENT_TYPES, JOB_TYPES, optionLabel } from "@/lib/enums";
import { formatDateOnly, formatDateTime, formatSalary, safeHttpUrl } from "@/lib/format";
import { keys } from "@/lib/keys";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";

function Field({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

/** A stored URL is a link only when it starts with http; anything else is shown as plain text. */
function UrlValue({ value }: { value: string | null }) {
  if (!value) return null;
  const href = safeHttpUrl(value);
  if (!href) return <>{value}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
      {href}
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  );
}

function Text({ value }: { value: string | null }) {
  return value ? <p className="text-sm break-words whitespace-pre-wrap">{value}</p> : null;
}

function JobDetails({ job }: { job: Job }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Location">{job.location}</Field>
          <Field label="Job type">{optionLabel(JOB_TYPES, job.job_type)}</Field>
          <Field label="Employment type">{optionLabel(EMPLOYMENT_TYPES, job.employment_type)}</Field>
          <Field label="Salary">{formatSalary(job.salary_min, job.salary_max, job.salary_currency)}</Field>
          <Field label="Application date">{formatDateOnly(job.application_date)}</Field>
          <Field label="Deadline">{formatDateOnly(job.deadline)}</Field>
          <Field label="Follow-up date">{formatDateOnly(job.follow_up_date)}</Field>
          <Field label="Interview">{formatDateTime(job.interview_at)}</Field>
          <Field label="Resume version">{job.resume_version}</Field>
          <Field label="Job posting">{job.job_url ? <UrlValue value={job.job_url} /> : null}</Field>
          <Field label="Company website">{job.company_website ? <UrlValue value={job.company_website} /> : null}</Field>
          <Field label="Company logo">{job.company_logo_url ? <UrlValue value={job.company_logo_url} /> : null}</Field>
        </dl>
        {job.cover_letter_ref ? (
          <section>
            <h3 className="mb-1 text-xs text-muted-foreground">Cover letter</h3>
            <Text value={job.cover_letter_ref} />
          </section>
        ) : null}
        {job.job_description ? (
          <section>
            <h3 className="mb-1 text-xs text-muted-foreground">Job description</h3>
            <Text value={job.job_description} />
          </section>
        ) : null}
        {job.notes ? (
          <section>
            <h3 className="mb-1 text-xs text-muted-foreground">Notes</h3>
            <Text value={job.notes} />
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const query = useQuery({
    queryKey: keys.detail("job", id),
    queryFn: () => api<Job>(`/jobs/${id}`),
  });

  const remove = useMutation({
    mutationFn: () => api<void>(`/jobs/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      // Drop the detail first so nothing refetches a record that no longer exists.
      client.removeQueries({ queryKey: keys.detail("job", id) });
      void client.invalidateQueries({ queryKey: ["jobs", "list"] });
      void client.invalidateQueries({ queryKey: ["reminders"] });
      void client.invalidateQueries({ queryKey: keys.dashboard });
      toast.success("Job deleted");
      router.replace("/jobs");
    },
    onError: (e) => {
      setConfirmingDelete(false);
      toast.error(e instanceof ApiError ? e.message : "Could not delete the job.");
    },
  });

  const error = query.error;
  // 404 is a missing or foreign record. 422 is an id that is not even a UUID. Neither is worth a retry.
  if (query.isError && query.data === undefined && error instanceof ApiError && (error.status === 404 || error.status === 422)) {
    return (
      <EmptyState
        title="Job not found"
        description="It may have been deleted, or the link is wrong."
        action={
          <Link href="/jobs" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft data-icon="inline-start" />
            Back to job applications
          </Link>
        }
      />
    );
  }

  return (
    <>
      <Link href="/jobs" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-3 -ml-2.5")}>
        <ArrowLeft data-icon="inline-start" />
        Job applications
      </Link>
      <DataState query={query} skeleton={<DataSkeleton />}>
        {(job) => (
          <>
            <PageHeader
              title={job.company_name}
              description={job.position_title}
              actions={
                <>
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil data-icon="inline-start" />
                    Edit
                  </Button>
                  <Button variant="destructive" onClick={() => setConfirmingDelete(true)}>
                    <Trash2 data-icon="inline-start" />
                    Delete
                  </Button>
                </>
              }
            />
            <div className="mb-6 flex flex-wrap gap-2">
              <StatusBadge status={job.status} />
              <PriorityBadge priority={job.priority} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <JobDetails job={job} />
              </div>
              <div className="space-y-6">
                <NotesPanel entityType="job" entityId={job.id} />
                <LinkedContacts entityType="job" entityId={job.id} />
              </div>
              <div className="space-y-6">
                <RemindersPanel relatedType="job" relatedId={job.id} />
                <ActivityTimeline entityType="job" entityId={job.id} />
              </div>
            </div>
            <JobFormDialog open={editing} onOpenChange={setEditing} job={job} />
            <ConfirmDialog
              open={confirmingDelete}
              onOpenChange={setConfirmingDelete}
              title={`Delete ${job.company_name}?`}
              description="This deletes the job application together with its notes and reminders. Linked contacts are kept. This cannot be undone."
              confirmLabel="Delete job"
              pending={remove.isPending}
              onConfirm={() => remove.mutate()}
            />
          </>
        )}
      </DataState>
    </>
  );
}
