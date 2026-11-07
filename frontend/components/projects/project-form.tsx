"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, FileText, Landmark } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FormSection } from "@/components/form-section";
import { NativeSelect } from "@/components/native-select";
import { TextAreaField } from "@/components/textarea-field";
import { TextField } from "@/components/text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, applyServerErrors } from "@/lib/api";
import { PROJECT_STAGES, PROJECT_TYPES } from "@/lib/enums";
import { buildBody } from "@/lib/form-body";
import { localToday } from "@/lib/format";
import { invalidateProject } from "@/lib/keys";
import type { Project } from "@/lib/types";

const short = z.string().max(200, "At most 200 characters");
const long = z.string().max(50_000, "At most 50,000 characters");

const schema = z.object({
  title: z.string().trim().min(1, "Enter the title").max(200, "At most 200 characters"),
  project_type: z.string(),
  stage: z.string(),
  topic: short,
  institution: short,
  target_date: z.string(),
  description: long,
  notes: long,
});

type Values = z.infer<typeof schema>;
type Field = keyof Values;

const FIELDS = Object.keys(schema.shape) as Field[];

// These can never be null: an emptied one is sent as an empty string and the API rejects it.
const REQUIRED: Field[] = ["title", "project_type", "stage"];

const EMPTY: Values = { title: "", project_type: "personal", stage: "idea", topic: "", institution: "", target_date: "", description: "", notes: "" };

function toValues(p: Project): Values {
  return {
    title: p.title,
    project_type: p.project_type,
    stage: p.stage,
    topic: p.topic ?? "",
    institution: p.institution ?? "",
    target_date: p.target_date ?? "",
    description: p.description ?? "",
    notes: p.notes ?? "",
  };
}

function ProjectFormBody({ project, onDone }: { project?: Project; onDone: () => void }) {
  const client = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, dirtyFields, submitCount },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: project ? toValues(project) : EMPTY });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      // `today` makes the response's next deadline match the list and the dashboard.
      const query = { today: localToday() };
      return project ? api<Project>(`/projects/${project.id}`, { method: "PATCH", body, query }) : api<Project>("/projects", { method: "POST", body, query });
    },
    onSuccess: async (saved) => {
      await invalidateProject(client, saved.id);
      toast.success(project ? "Project updated" : "Project added");
      onDone();
    },
    onError: (e) => setFormError(applyServerErrors(e, setError, FIELDS)),
  });

  function onSubmit(values: Values) {
    setFormError(null);
    if (!project) return save.mutate(buildBody(values, FIELDS, true, REQUIRED));
    // Edit: only send what changed.
    const changed = FIELDS.filter((f) => dirtyFields[f]);
    if (changed.length === 0) return onDone();
    save.mutate(buildBody(values, changed, false, REQUIRED));
  }

  const err = (f: Field) => errors[f]?.message;
  const invalid = (...fields: Field[]) => fields.some((f) => errors[f]);
  // Sections holding saved values start open when editing.
  const saved = project ? toValues(project) : null;
  const filled = (...fields: Field[]) => !!saved && fields.some((f) => saved[f] !== EMPTY[f]);

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="sr-only">Project</legend>
        <div className="sm:col-span-2">
          <TextField label="Title" error={err("title")} {...register("title")} />
        </div>
        <NativeSelect label="Type" options={PROJECT_TYPES} error={err("project_type")} {...register("project_type")} />
        <NativeSelect label="Stage" options={PROJECT_STAGES} error={err("stage")} {...register("stage")} />
      </fieldset>

      <div className="border-b">
        <FormSection submitCount={submitCount} icon={Landmark} title="Topic and place" hint="Topic and institution" defaultOpen={filled("topic", "institution")} hasError={invalid("topic", "institution")}>
          <TextField label="Topic" error={err("topic")} {...register("topic")} />
          <TextField label="Institution" error={err("institution")} {...register("institution")} />
        </FormSection>

        <FormSection submitCount={submitCount} icon={CalendarDays} title="Dates" hint="Target date" defaultOpen={filled("target_date")} hasError={invalid("target_date")}>
          <TextField label="Target date" type="date" error={err("target_date")} {...register("target_date")} />
        </FormSection>

        <FormSection submitCount={submitCount} icon={FileText} title="Details" hint="Description and notes" className="grid grid-cols-1 gap-4" defaultOpen={filled("description", "notes")} hasError={invalid("description", "notes")}>
          <TextAreaField label="Description" error={err("description")} {...register("description")} />
          <TextAreaField label="Notes" error={err("notes")} {...register("notes")} />
        </FormSection>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving..." : project ? "Save changes" : "Add project"}
        </Button>
      </div>
    </form>
  );
}

/** Add (no `project`) or edit (with `project`) dialog. Submissions and milestones are edited on the project page. */
export function ProjectFormDialog({ open, onOpenChange, project }: { open: boolean; onOpenChange: (open: boolean) => void; project?: Project }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "Add a research project"}</DialogTitle>
          <DialogDescription>{project ? "Clear a field to remove its value." : "Only a title is needed. Open a section to add more."}</DialogDescription>
        </DialogHeader>
        <ProjectFormBody project={project} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
