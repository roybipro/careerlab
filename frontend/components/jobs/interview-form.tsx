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
import { INTERVIEW_OUTCOMES, INTERVIEW_TYPES, type Option } from "@/lib/enums";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/format";
import { invalidateEntity } from "@/lib/keys";
import type { JobInterview } from "@/lib/types";

export const RATINGS: Option[] = [
  { value: "1", label: "1 · Went badly" },
  { value: "2", label: "2 · Not great" },
  { value: "3", label: "3 · Okay" },
  { value: "4", label: "4 · Went well" },
  { value: "5", label: "5 · Went very well" },
];

const schema = z.object({
  title: z.string().trim().min(1, "Name the round, for example Recruiter screen").max(200, "At most 200 characters"),
  interview_type: z.string(),
  outcome: z.string(),
  scheduled_at: z.string(),
  duration_minutes: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) >= 5 && Number(v) <= 1440), "Enter 5 to 1440 minutes"),
  location: z.string().max(500, "At most 500 characters"),
  interviewers: z.string().max(500, "At most 500 characters"),
  rating: z.string(),
  thank_you_sent: z.boolean(),
  questions: z.string().max(50_000, "At most 50,000 characters"),
  notes: z.string().max(50_000, "At most 50,000 characters"),
});

type Values = z.infer<typeof schema>;
type Field = keyof Values;

const FIELDS: Field[] = ["title", "interview_type", "outcome", "scheduled_at", "duration_minutes", "location", "interviewers", "rating", "thank_you_sent", "questions", "notes"];
const REQUIRED: Field[] = ["title", "interview_type", "outcome"];

const EMPTY: Values = {
  title: "",
  interview_type: "other",
  outcome: "pending",
  scheduled_at: "",
  duration_minutes: "",
  location: "",
  interviewers: "",
  rating: "",
  thank_you_sent: false,
  questions: "",
  notes: "",
};

function toValues(i: JobInterview): Values {
  return {
    title: i.title,
    interview_type: i.interview_type,
    outcome: i.outcome,
    scheduled_at: toDatetimeLocal(i.scheduled_at),
    duration_minutes: i.duration_minutes?.toString() ?? "",
    location: i.location ?? "",
    interviewers: i.interviewers ?? "",
    rating: i.rating?.toString() ?? "",
    thank_you_sent: i.thank_you_sent,
    questions: i.questions ?? "",
    notes: i.notes ?? "",
  };
}

/** One value as the API wants it: an emptied optional field is null, numbers and the time are converted. */
function toApiValue(field: Field, value: string | boolean): string | number | boolean | null {
  if (typeof value === "boolean") return value;
  const v = value.trim();
  if (REQUIRED.includes(field)) return v;
  if (v === "") return null;
  if (field === "duration_minutes" || field === "rating") return Number(v);
  if (field === "scheduled_at") return fromDatetimeLocal(v);
  return v;
}

function buildBody(values: Values, fields: Field[], isCreate: boolean) {
  const body: Record<string, string | number | boolean | null> = {};
  for (const field of fields) {
    const value = toApiValue(field, values[field]);
    // Create leaves empty optional fields out; edit sends null, which clears the stored value.
    if (value === null && isCreate) continue;
    body[field] = value;
  }
  return body;
}

function InterviewFormBody({ jobId, interview, onDone }: { jobId: string; interview?: JobInterview; onDone: () => void }) {
  const client = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, dirtyFields },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: interview ? toValues(interview) : EMPTY });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      interview
        ? api<JobInterview>(`/jobs/${jobId}/interviews/${interview.id}`, { method: "PATCH", body })
        : api<JobInterview>(`/jobs/${jobId}/interviews`, { method: "POST", body }),
    onSuccess: async () => {
      // The job's rounds live under ["jobs"], and a scheduled round adds to its activity.
      await invalidateEntity(client, "job", jobId);
      toast.success(interview ? "Interview updated" : "Interview added");
      onDone();
    },
    onError: (e) => setFormError(applyServerErrors(e, setError, FIELDS)),
  });

  function onSubmit(values: Values) {
    setFormError(null);
    if (!interview) return save.mutate(buildBody(values, FIELDS, true));
    const changed = FIELDS.filter((f) => dirtyFields[f]);
    if (changed.length === 0) return onDone();
    save.mutate(buildBody(values, changed, false));
  }

  const err = (f: Field) => errors[f]?.message;

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <TextField label="Round" placeholder="Recruiter screen" error={err("title")} {...register("title")} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NativeSelect label="Type" options={INTERVIEW_TYPES} error={err("interview_type")} {...register("interview_type")} />
        <NativeSelect label="Outcome" options={INTERVIEW_OUTCOMES} error={err("outcome")} {...register("outcome")} />
        <TextField label="Date and time" type="datetime-local" hint="In your time zone" error={err("scheduled_at")} {...register("scheduled_at")} />
        <TextField label="Length (minutes)" type="number" inputMode="numeric" min={5} max={1440} step={5} error={err("duration_minutes")} {...register("duration_minutes")} />
      </div>
      <TextField label="Where" placeholder="Office address or meeting link" error={err("location")} {...register("location")} />
      <TextField label="Interviewers" placeholder="Names and roles" error={err("interviewers")} {...register("interviewers")} />
      <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
        <NativeSelect label="How it went" options={RATINGS} placeholder="Not rated" error={err("rating")} {...register("rating")} />
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" {...register("thank_you_sent")} />
          Thank-you note sent
        </label>
      </div>
      <TextAreaField label="Questions asked" placeholder="What they asked, to prepare for the next round" error={err("questions")} {...register("questions")} />
      <TextAreaField label="Notes" error={err("notes")} {...register("notes")} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving..." : interview ? "Save changes" : "Add interview"}
        </Button>
      </div>
    </form>
  );
}

/** Add (no `interview`) or edit (with `interview`) dialog. */
export function InterviewFormDialog({ open, onOpenChange, jobId, interview }: { open: boolean; onOpenChange: (open: boolean) => void; jobId: string; interview?: JobInterview }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{interview ? "Edit interview" : "Add an interview"}</DialogTitle>
          <DialogDescription>{interview ? "Clear a field to remove its value." : "One round of the process, such as a screen, a technical interview or an onsite."}</DialogDescription>
        </DialogHeader>
        <InterviewFormBody jobId={jobId} interview={interview} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
