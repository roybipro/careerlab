"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { NativeSelect } from "@/components/native-select";
import { TextAreaField } from "@/components/textarea-field";
import { TextField } from "@/components/text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, applyServerErrors } from "@/lib/api";
import { SUBMISSION_STATUSES, VENUE_TYPES } from "@/lib/enums";
import { buildBody } from "@/lib/form-body";
import { invalidateProject } from "@/lib/keys";
import type { ProjectSubmission } from "@/lib/types";

const schema = z
  .object({
    venue_name: z.string().trim().min(1, "Enter the venue name").max(200, "At most 200 characters"),
    venue_type: z.string(),
    status: z.string(),
    venue_url: z.string().max(2000, "At most 2,000 characters"),
    abstract_deadline: z.string(),
    paper_deadline: z.string(),
    notification_date: z.string(),
    submitted_on: z.string(),
    feedback: z.string().max(50_000, "At most 50,000 characters"),
  })
  // Plain dates ("YYYY-MM-DD") compare correctly as text. The API checks the same rule.
  .refine((v) => !v.abstract_deadline || !v.paper_deadline || v.abstract_deadline <= v.paper_deadline, {
    path: ["abstract_deadline"],
    message: "The abstract deadline cannot be after the paper deadline",
  });

type Values = z.infer<typeof schema>;
type Field = keyof Values;

const FIELDS: Field[] = ["venue_name", "venue_type", "status", "venue_url", "abstract_deadline", "paper_deadline", "notification_date", "submitted_on", "feedback"];
const REQUIRED: Field[] = ["venue_name", "venue_type", "status"];

const EMPTY: Values = {
  venue_name: "",
  venue_type: "conference",
  status: "planned",
  venue_url: "",
  abstract_deadline: "",
  paper_deadline: "",
  notification_date: "",
  submitted_on: "",
  feedback: "",
};

function toValues(s: ProjectSubmission): Values {
  return {
    venue_name: s.venue_name,
    venue_type: s.venue_type,
    status: s.status,
    venue_url: s.venue_url ?? "",
    abstract_deadline: s.abstract_deadline ?? "",
    paper_deadline: s.paper_deadline ?? "",
    notification_date: s.notification_date ?? "",
    submitted_on: s.submitted_on ?? "",
    feedback: s.feedback ?? "",
  };
}

function SubmissionFormBody({ projectId, submission, onDone }: { projectId: string; submission?: ProjectSubmission; onDone: () => void }) {
  const client = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, dirtyFields },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: submission ? toValues(submission) : EMPTY });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      submission
        ? api<ProjectSubmission>(`/projects/${projectId}/submissions/${submission.id}`, { method: "PATCH", body })
        : api<ProjectSubmission>(`/projects/${projectId}/submissions`, { method: "POST", body }),
    onSuccess: async () => {
      await invalidateProject(client, projectId);
      toast.success(submission ? "Submission updated" : "Submission added");
      onDone();
    },
    onError: (e) => setFormError(applyServerErrors(e, setError, FIELDS)),
  });

  function onSubmit(values: Values) {
    setFormError(null);
    if (!submission) return save.mutate(buildBody(values, FIELDS, true, REQUIRED));
    const changed = FIELDS.filter((f) => dirtyFields[f]);
    if (changed.length === 0) return onDone();
    save.mutate(buildBody(values, changed, false, REQUIRED));
  }

  const err = (f: Field) => errors[f]?.message;

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <TextField label="Venue" error={err("venue_name")} {...register("venue_name")} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NativeSelect label="Venue type" options={VENUE_TYPES} error={err("venue_type")} {...register("venue_type")} />
        <NativeSelect label="Status" options={SUBMISSION_STATUSES} error={err("status")} {...register("status")} />
      </div>
      <TextField label="Venue website" type="url" inputMode="url" placeholder="https://" error={err("venue_url")} {...register("venue_url")} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Abstract deadline" type="date" error={err("abstract_deadline")} {...register("abstract_deadline")} />
        <TextField label="Paper deadline" type="date" error={err("paper_deadline")} {...register("paper_deadline")} />
        <TextField label="Submitted on" type="date" error={err("submitted_on")} {...register("submitted_on")} />
        <TextField label="Notification date" type="date" error={err("notification_date")} {...register("notification_date")} />
      </div>
      <TextAreaField label="Feedback" error={err("feedback")} {...register("feedback")} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving..." : submission ? "Save changes" : "Add submission"}
        </Button>
      </div>
    </form>
  );
}

/** Add (no `submission`) or edit (with `submission`) dialog. */
export function SubmissionFormDialog({ open, onOpenChange, projectId, submission }: { open: boolean; onOpenChange: (open: boolean) => void; projectId: string; submission?: ProjectSubmission }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{submission ? "Edit submission" : "Add a submission"}</DialogTitle>
          <DialogDescription>{submission ? "Clear a field to remove its value." : "A conference, journal or workshop you plan to send this project to."}</DialogDescription>
        </DialogHeader>
        <SubmissionFormBody projectId={projectId} submission={submission} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
