"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, Building2, CalendarDays, FileText, GraduationCap, Link2, X } from "lucide-react";
import { useId, useState } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { NativeSelect } from "@/components/native-select";
import { FormSection } from "@/components/form-section";
import { TextAreaField } from "@/components/textarea-field";
import { TextField } from "@/components/text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, applyServerErrors } from "@/lib/api";
import { FUNDING_STATUSES, OPPORTUNITY_TYPES, RESEARCH_STATUSES } from "@/lib/enums";
import { invalidateEntity } from "@/lib/keys";
import type { Research } from "@/lib/types";

const url = z
  .string()
  .trim()
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Enter a link starting with http:// or https://");
const short = z.string().max(200, "At most 200 characters");
const long = z.string().max(50_000, "At most 50,000 characters");

const MAX_INTERESTS = 100;

const schema = z.object({
  title: z.string().trim().min(1, "Enter the title").max(200, "At most 200 characters"),
  organization: z.string().trim().min(1, "Enter the organization").max(200, "At most 200 characters"),
  status: z.string(),
  opportunity_type: z.string(),
  funding_status: z.string(),
  funding_amount: short,
  country: z.string().max(100, "At most 100 characters"),
  department: short,
  laboratory: short,
  research_area: short,
  professor_name: short,
  professor_email: z.string().max(320, "At most 320 characters"),
  professor_website: url,
  website: url,
  application_url: url,
  application_date: z.string(),
  deadline: z.string(),
  description: long,
  eligibility: long,
  language_test_requirements: long,
  notes: long,
  research_interests: z.array(z.string().max(200)).max(MAX_INTERESTS, `At most ${MAX_INTERESTS} interests`),
});

type Values = z.infer<typeof schema>;
type Field = keyof Values;

const FIELDS = Object.keys(schema.shape) as Field[];

const EMPTY: Values = {
  title: "",
  organization: "",
  status: "discovered",
  opportunity_type: "",
  funding_status: "unknown",
  funding_amount: "",
  country: "",
  department: "",
  laboratory: "",
  research_area: "",
  professor_name: "",
  professor_email: "",
  professor_website: "",
  website: "",
  application_url: "",
  application_date: "",
  deadline: "",
  description: "",
  eligibility: "",
  language_test_requirements: "",
  notes: "",
  research_interests: [],
};

function toValues(r: Research): Values {
  return {
    title: r.title,
    organization: r.organization,
    status: r.status,
    opportunity_type: r.opportunity_type ?? "",
    funding_status: r.funding_status,
    funding_amount: r.funding_amount ?? "",
    country: r.country ?? "",
    department: r.department ?? "",
    laboratory: r.laboratory ?? "",
    research_area: r.research_area ?? "",
    professor_name: r.professor_name ?? "",
    professor_email: r.professor_email ?? "",
    professor_website: r.professor_website ?? "",
    website: r.website ?? "",
    application_url: r.application_url ?? "",
    application_date: r.application_date ?? "",
    deadline: r.deadline ?? "",
    description: r.description ?? "",
    eligibility: r.eligibility ?? "",
    language_test_requirements: r.language_test_requirements ?? "",
    notes: r.notes ?? "",
    research_interests: r.research_interests,
  };
}

// These can never be null: an emptied one is sent as an empty string and the API rejects it.
const REQUIRED: Field[] = ["title", "organization", "status", "funding_status"];

/** One form value as the API wants it: "" becomes null (clears the field). Interests are a list and never null. */
function toApiValue(field: Field, value: string | string[]): string | string[] | null {
  if (Array.isArray(value)) return value;
  const v = value.trim();
  if (REQUIRED.includes(field)) return v;
  return v === "" ? null : v;
}

function buildBody(values: Values, fields: Field[], isCreate: boolean) {
  const body: Record<string, string | string[] | null> = {};
  for (const field of fields) {
    const apiValue = toApiValue(field, values[field]);
    // Create leaves empty optional fields out. Edit sends null for them, which clears the stored value.
    if (isCreate && (apiValue === null || (Array.isArray(apiValue) && apiValue.length === 0))) continue;
    body[field] = apiValue;
  }
  return body;
}

/** Tags: Enter or comma adds, each one has its own remove button. Leaving the box also adds what is typed. */
function InterestsInput({ control, error }: { control: Control<Values>; error?: string }) {
  const id = useId();
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);

  return (
    <Controller
      control={control}
      name="research_interests"
      render={({ field: { value, onChange } }) => {
        /** Adds each piece in turn (a pasted "a, b, c" has several) and reports the first problem. */
        function add(pieces: string[]) {
          let next = value;
          let problem: string | null = null;
          for (const raw of pieces) {
            const label = raw.trim();
            if (!label) continue;
            if (next.some((t) => t.toLowerCase() === label.toLowerCase())) problem ??= `"${label}" is already in the list.`;
            else if (label.length > 200) problem ??= "An interest can be at most 200 characters.";
            else if (next.length >= MAX_INTERESTS) problem ??= `At most ${MAX_INTERESTS} interests.`;
            else next = [...next, label];
          }
          setNote(problem);
          if (next !== value) onChange(next);
          return problem === null;
        }

        const message = note ?? error;
        return (
          <div className="space-y-1.5">
            <Label htmlFor={id}>Research interests</Label>
            {value.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5" aria-label="Research interests added">
                {value.map((tag) => (
                  <li key={tag} className="inline-flex items-center gap-1 rounded-md bg-secondary py-0.5 pr-0.5 pl-2 text-sm text-secondary-foreground">
                    <span className="break-all">{tag}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${tag}`}
                      className="rounded p-0.5 hover:bg-background/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      onClick={() => onChange(value.filter((t) => t !== tag))}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Input
              id={id}
              value={text}
              placeholder="Type an interest, then press Enter or comma"
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? `${id}-msg` : undefined}
              onChange={(e) => {
                const parts = e.target.value.split(",");
                setNote(null);
                if (parts.length === 1) return setText(parts[0]);
                // A comma ends a tag. The text after the last comma stays in the box.
                add(parts.slice(0, -1));
                setText(parts[parts.length - 1]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault(); // Enter must not submit the form.
                  if (add([text])) setText("");
                } else if (e.key === "Backspace" && text === "" && value.length > 0) {
                  onChange(value.slice(0, -1));
                }
              }}
              onBlur={() => add([text]) && setText("")}
            />
            {message ? (
              <p id={`${id}-msg`} className="text-xs text-destructive">
                {message}
              </p>
            ) : null}
          </div>
        );
      }}
    />
  );
}

function ResearchFormBody({ research, onDone }: { research?: Research; onDone: () => void }) {
  const client = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, dirtyFields },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: research ? toValues(research) : EMPTY });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      research ? api<Research>(`/research/${research.id}`, { method: "PATCH", body }) : api<Research>("/research", { method: "POST", body }),
    onSuccess: async (saved) => {
      await invalidateEntity(client, "research", saved.id);
      toast.success(research ? "Opportunity updated" : "Opportunity added");
      onDone();
    },
    onError: (e) => setFormError(applyServerErrors(e, setError, FIELDS)),
  });

  function onSubmit(values: Values) {
    setFormError(null);
    if (!research) return save.mutate(buildBody(values, FIELDS, true));
    // Edit: only send what changed. Interests are compared by value, since a list is "dirty" once touched.
    const before = research.research_interests.join("\u0000");
    const changed = FIELDS.filter((f) => (f === "research_interests" ? values[f].join("\u0000") !== before : dirtyFields[f]));
    if (changed.length === 0) return onDone();
    save.mutate(buildBody(values, changed, false));
  }

  const err = (f: Exclude<Field, "research_interests">) => errors[f]?.message;
  const interestsError = errors.research_interests?.message ?? errors.research_interests?.root?.message;
  const invalid = (...fields: Field[]) => fields.some((f) => errors[f]);
  // Sections holding saved values start open when editing.
  const saved = research ? toValues(research) : null;
  const filled = (...fields: Field[]) =>
    !!saved &&
    fields.some((f) => {
      const value = saved[f];
      return Array.isArray(value) ? value.length > 0 : value !== EMPTY[f];
    });

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="sr-only">Opportunity</legend>
        <TextField label="Title" error={err("title")} {...register("title")} />
        <TextField label="Organization" error={err("organization")} {...register("organization")} />
        <NativeSelect label="Status" options={RESEARCH_STATUSES} error={err("status")} {...register("status")} />
        <NativeSelect label="Type" options={OPPORTUNITY_TYPES} placeholder="Not set" error={err("opportunity_type")} {...register("opportunity_type")} />
      </fieldset>

      <div className="border-b">
        <FormSection icon={Banknote} title="Funding" hint="Funding status and amount" defaultOpen={filled("funding_status", "funding_amount")} hasError={invalid("funding_status", "funding_amount")}>
          <NativeSelect label="Funding" options={FUNDING_STATUSES} error={err("funding_status")} {...register("funding_status")} />
          <TextField label="Funding amount" placeholder="2,000 per month" error={err("funding_amount")} {...register("funding_amount")} />
        </FormSection>

        <FormSection icon={Building2} title="Place and field" hint="Country, department, lab and research interests" defaultOpen={filled("country", "department", "laboratory", "research_area", "research_interests")} hasError={invalid("country", "department", "laboratory", "research_area") || !!interestsError}>
          <TextField label="Country" error={err("country")} {...register("country")} />
          <TextField label="Department" error={err("department")} {...register("department")} />
          <TextField label="Laboratory" error={err("laboratory")} {...register("laboratory")} />
          <TextField label="Research area" error={err("research_area")} {...register("research_area")} />
          <div className="sm:col-span-2">
            <InterestsInput control={control} error={interestsError} />
          </div>
        </FormSection>

        <FormSection icon={CalendarDays} title="Dates" hint="Applied and deadline" defaultOpen={filled("application_date", "deadline")} hasError={invalid("application_date", "deadline")}>
          <TextField label="Application date" type="date" error={err("application_date")} {...register("application_date")} />
          <TextField label="Deadline" type="date" error={err("deadline")} {...register("deadline")} />
        </FormSection>

        <FormSection icon={GraduationCap} title="Professor" hint="Name, email and website" defaultOpen={filled("professor_name", "professor_email", "professor_website")} hasError={invalid("professor_name", "professor_email", "professor_website")}>
          <TextField label="Professor name" error={err("professor_name")} {...register("professor_name")} />
          <TextField label="Professor email" type="email" error={err("professor_email")} {...register("professor_email")} />
          <TextField label="Professor website" type="url" placeholder="https://" error={err("professor_website")} {...register("professor_website")} />
        </FormSection>

        <FormSection icon={Link2} title="Links" hint="Website and application page" defaultOpen={filled("website", "application_url")} hasError={invalid("website", "application_url")}>
          <TextField label="Website" type="url" placeholder="https://" error={err("website")} {...register("website")} />
          <TextField label="Application URL" type="url" placeholder="https://" error={err("application_url")} {...register("application_url")} />
        </FormSection>

        <FormSection icon={FileText} title="Details" hint="Description, eligibility, language tests and notes" className="grid grid-cols-1 gap-4" defaultOpen={filled("description", "eligibility", "language_test_requirements", "notes")} hasError={invalid("description", "eligibility", "language_test_requirements", "notes")}>
          <TextAreaField label="Description" error={err("description")} {...register("description")} />
          <TextAreaField label="Eligibility" error={err("eligibility")} {...register("eligibility")} />
          <TextAreaField label="Language test requirements (IELTS, GRE)" error={err("language_test_requirements")} {...register("language_test_requirements")} />
          <TextAreaField label="Notes" error={err("notes")} {...register("notes")} />
        </FormSection>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving..." : research ? "Save changes" : "Add opportunity"}
        </Button>
      </div>
    </form>
  );
}

/** Add (no `research`) or edit (with `research`) dialog. Documents and publication links are edited on the detail page. */
export function ResearchFormDialog({ open, onOpenChange, research }: { open: boolean; onOpenChange: (open: boolean) => void; research?: Research }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{research ? "Edit opportunity" : "Add a research opportunity"}</DialogTitle>
          <DialogDescription>{research ? "Clear a field to remove its value." : "Only title and organization are needed. Open a section to add more."}</DialogDescription>
        </DialogHeader>
        <ResearchFormBody research={research} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
