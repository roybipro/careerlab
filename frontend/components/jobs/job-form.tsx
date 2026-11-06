"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, CalendarDays, FileText, Link2, MapPin } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { NativeSelect } from "@/components/native-select";
import { FormSection } from "@/components/form-section";
import { TextAreaField } from "@/components/textarea-field";
import { TextField } from "@/components/text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, applyServerErrors } from "@/lib/api";
import { EMPLOYMENT_TYPES, JOB_STATUSES, JOB_TYPES, PRIORITIES } from "@/lib/enums";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/format";
import { invalidateEntity } from "@/lib/keys";
import type { Job } from "@/lib/types";

const url = z
  .string()
  .trim()
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Enter a link starting with http:// or https://");
const salary = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{1,10}$/.test(v), "Enter a whole number, 0 or more")
  .refine((v) => v === "" || Number(v) <= 2_000_000_000, "That number is too large");

const schema = z
  .object({
    company_name: z.string().trim().min(1, "Enter the company name").max(200, "At most 200 characters"),
    position_title: z.string().trim().min(1, "Enter the position title").max(200, "At most 200 characters"),
    status: z.string(),
    priority: z.string(),
    job_type: z.string(),
    employment_type: z.string(),
    location: z.string().max(200, "At most 200 characters"),
    job_url: url,
    company_website: url,
    company_logo_url: url,
    salary_min: salary,
    salary_max: salary,
    salary_currency: z.string().max(10, "At most 10 characters"),
    application_date: z.string(),
    deadline: z.string(),
    follow_up_date: z.string(),
    interview_at: z.string(),
    resume_version: z.string().max(500, "At most 500 characters"),
    cover_letter_ref: z.string().max(50_000),
    job_description: z.string().max(50_000),
    notes: z.string().max(50_000),
  })
  .superRefine((v, ctx) => {
    // Client-side twin of the API's check. The server's message is shown too if it ever disagrees.
    if (v.salary_min.trim() && v.salary_max.trim() && Number(v.salary_min) > Number(v.salary_max)) {
      ctx.addIssue({ code: "custom", path: ["salary_min"], message: "Minimum salary cannot be above the maximum" });
    }
  });

type Values = z.infer<typeof schema>;
type Field = keyof Values;

const FIELDS = Object.keys(schema.shape) as Field[];
const NUMBER_FIELDS: Field[] = ["salary_min", "salary_max"];

const EMPTY: Values = {
  company_name: "",
  position_title: "",
  status: "wishlist",
  priority: "medium",
  job_type: "",
  employment_type: "",
  location: "",
  job_url: "",
  company_website: "",
  company_logo_url: "",
  salary_min: "",
  salary_max: "",
  salary_currency: "",
  application_date: "",
  deadline: "",
  follow_up_date: "",
  interview_at: "",
  resume_version: "",
  cover_letter_ref: "",
  job_description: "",
  notes: "",
};

function toValues(job: Job): Values {
  return {
    company_name: job.company_name,
    position_title: job.position_title,
    status: job.status,
    priority: job.priority,
    job_type: job.job_type ?? "",
    employment_type: job.employment_type ?? "",
    location: job.location ?? "",
    job_url: job.job_url ?? "",
    company_website: job.company_website ?? "",
    company_logo_url: job.company_logo_url ?? "",
    salary_min: job.salary_min?.toString() ?? "",
    salary_max: job.salary_max?.toString() ?? "",
    salary_currency: job.salary_currency ?? "",
    application_date: job.application_date ?? "",
    deadline: job.deadline ?? "",
    follow_up_date: job.follow_up_date ?? "",
    interview_at: toDatetimeLocal(job.interview_at),
    resume_version: job.resume_version ?? "",
    cover_letter_ref: job.cover_letter_ref ?? "",
    job_description: job.job_description ?? "",
    notes: job.notes ?? "",
  };
}

const REQUIRED: Field[] = ["company_name", "position_title", "status", "priority"];

/** One form value as the API wants it: "" becomes null (clears the field), numbers and timestamps are converted. */
function toApiValue(field: Field, value: string): string | number | null {
  const v = value.trim();
  if (REQUIRED.includes(field)) return v;
  if (v === "") return null;
  if (NUMBER_FIELDS.includes(field)) return Number(v);
  if (field === "interview_at") return fromDatetimeLocal(v);
  return v;
}

function buildBody(values: Values, fields: Field[], isCreate: boolean) {
  const body: Record<string, string | number | null> = {};
  for (const field of fields) {
    const apiValue = toApiValue(field, values[field]);
    // Create leaves empty optional fields out. Edit sends null for them, which clears the stored value.
    if (isCreate && apiValue === null) continue;
    body[field] = apiValue;
  }
  return body;
}

function JobFormBody({ job, onDone }: { job?: Job; onDone: () => void }) {
  const client = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, dirtyFields, submitCount },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: job ? toValues(job) : EMPTY });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      job ? api<Job>(`/jobs/${job.id}`, { method: "PATCH", body }) : api<Job>("/jobs", { method: "POST", body }),
    onSuccess: async (saved) => {
      await invalidateEntity(client, "job", saved.id);
      toast.success(job ? "Job updated" : "Job added");
      onDone();
    },
    onError: (e) => setFormError(applyServerErrors(e, setError, FIELDS)),
  });

  function onSubmit(values: Values) {
    setFormError(null);
    if (!job) return save.mutate(buildBody(values, FIELDS, true));
    // Edit: only send what changed.
    const changed = FIELDS.filter((f) => dirtyFields[f]);
    if (changed.length === 0) return onDone();
    save.mutate(buildBody(values, changed, false));
  }

  const err = (f: Field) => errors[f]?.message;
  const invalid = (...fields: Field[]) => fields.some((f) => errors[f]);
  // Sections holding saved values start open when editing.
  const filled = (...fields: Field[]) => !!job && fields.some((f) => toValues(job)[f] !== "");

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="sr-only">Job</legend>
        <TextField label="Company" error={err("company_name")} {...register("company_name")} />
        <TextField label="Position" error={err("position_title")} {...register("position_title")} />
        <NativeSelect label="Status" options={JOB_STATUSES} error={err("status")} {...register("status")} />
        <NativeSelect label="Priority" options={PRIORITIES} error={err("priority")} {...register("priority")} />
      </fieldset>

      <div className="border-b">
        <FormSection submitCount={submitCount} icon={MapPin} title="Role" hint="Job type, employment type and location" defaultOpen={filled("job_type", "employment_type", "location")} hasError={invalid("job_type", "employment_type", "location")}>
          <NativeSelect label="Job type" options={JOB_TYPES} placeholder="Not set" error={err("job_type")} {...register("job_type")} />
          <NativeSelect label="Employment type" options={EMPLOYMENT_TYPES} placeholder="Not set" error={err("employment_type")} {...register("employment_type")} />
          <TextField label="Location" error={err("location")} {...register("location")} />
        </FormSection>

        <FormSection submitCount={submitCount} icon={CalendarDays} title="Dates" hint="Applied, deadline, follow-up and interview" defaultOpen={filled("application_date", "deadline", "follow_up_date", "interview_at")} hasError={invalid("application_date", "deadline", "follow_up_date", "interview_at")}>
          <TextField label="Application date" type="date" error={err("application_date")} {...register("application_date")} />
          <TextField label="Deadline" type="date" error={err("deadline")} {...register("deadline")} />
          <TextField label="Follow-up date" type="date" error={err("follow_up_date")} {...register("follow_up_date")} />
          <TextField label="Interview" type="datetime-local" hint="In your time zone" error={err("interview_at")} {...register("interview_at")} />
        </FormSection>

        <FormSection submitCount={submitCount} icon={Banknote} title="Salary" hint="Range and currency" className="grid grid-cols-1 gap-4 sm:grid-cols-3" defaultOpen={filled("salary_min", "salary_max", "salary_currency")} hasError={invalid("salary_min", "salary_max", "salary_currency")}>
          <TextField label="Minimum" type="number" inputMode="numeric" min={0} step={1} error={err("salary_min")} {...register("salary_min", { deps: ["salary_max"] })} />
          <TextField label="Maximum" type="number" inputMode="numeric" min={0} step={1} error={err("salary_max")} {...register("salary_max", { deps: ["salary_min"] })} />
          <TextField label="Currency" placeholder="USD" error={err("salary_currency")} {...register("salary_currency")} />
        </FormSection>

        <FormSection submitCount={submitCount} icon={Link2} title="Links" hint="Job posting, company website and logo" defaultOpen={filled("job_url", "company_website", "company_logo_url")} hasError={invalid("job_url", "company_website", "company_logo_url")}>
          <TextField label="Job posting URL" type="url" placeholder="https://" error={err("job_url")} {...register("job_url")} />
          <TextField label="Company website" type="url" placeholder="https://" error={err("company_website")} {...register("company_website")} />
          <TextField label="Company logo URL" type="url" placeholder="https://" error={err("company_logo_url")} {...register("company_logo_url")} />
        </FormSection>

        <FormSection submitCount={submitCount} icon={FileText} title="Details" hint="Resume, cover letter, description and notes" className="grid grid-cols-1 gap-4" defaultOpen={filled("resume_version", "cover_letter_ref", "job_description", "notes")} hasError={invalid("resume_version", "cover_letter_ref", "job_description", "notes")}>
          <TextField label="Resume version" error={err("resume_version")} {...register("resume_version")} />
          <TextAreaField label="Cover letter (name, link or text)" error={err("cover_letter_ref")} {...register("cover_letter_ref")} />
          <TextAreaField label="Job description" error={err("job_description")} {...register("job_description")} />
          <TextAreaField label="Notes" error={err("notes")} {...register("notes")} />
        </FormSection>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving..." : job ? "Save changes" : "Add job"}
        </Button>
      </div>
    </form>
  );
}

/** Add (no `job`) or edit (with `job`) dialog. */
export function JobFormDialog({ open, onOpenChange, job }: { open: boolean; onOpenChange: (open: boolean) => void; job?: Job }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{job ? "Edit job" : "Add a job"}</DialogTitle>
          <DialogDescription>{job ? "Clear a field to remove its value." : "Only company and position are needed. Open a section to add more."}</DialogDescription>
        </DialogHeader>
        <JobFormBody job={job} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
