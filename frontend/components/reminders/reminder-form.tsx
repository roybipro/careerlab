"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { TextAreaField } from "@/components/textarea-field";
import { TextField } from "@/components/text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, applyServerErrors } from "@/lib/api";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/format";
import { invalidateReminders } from "@/lib/keys";
import type { Reminder } from "@/lib/types";

type Values = { title: string; description: string; due_at: string };

/** With `reminder` the form edits it (PATCH); without, it adds a new one. */
function ReminderFormBody({ onDone, reminder }: { onDone: () => void; reminder?: Reminder }) {
  const client = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    defaultValues: reminder
      ? { title: reminder.title, description: reminder.description ?? "", due_at: toDatetimeLocal(reminder.due_at) }
      : { title: "", description: "", due_at: "" },
  });

  const save = useMutation({
    mutationFn: (v: Values) => {
      // datetime-local has no offset; the API rejects timestamps without one.
      const body = { title: v.title.trim(), due_at: fromDatetimeLocal(v.due_at) };
      const description = v.description.trim();
      if (reminder) {
        // An emptied description is sent as null, which clears it.
        return api<Reminder>(`/reminders/${reminder.id}`, { method: "PATCH", body: { ...body, description: description || null } });
      }
      return api<Reminder>("/reminders", { method: "POST", body: { ...body, ...(description ? { description } : {}) } });
    },
    onSuccess: async () => {
      await invalidateReminders(client);
      toast.success(reminder ? "Reminder updated" : "Reminder added");
      onDone();
    },
    onError: (e) => setFormError(applyServerErrors(e, setError, ["title", "description", "due_at"])),
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((v) => {
        setFormError(null);
        save.mutate(v);
      })}
    >
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <TextField
        label="Reminder"
        placeholder="Follow up with the recruiter"
        error={errors.title?.message}
        {...register("title", { validate: (v) => v.trim() !== "" || "Enter a title", maxLength: { value: 200, message: "At most 200 characters" } })}
      />
      <TextField label="Due" type="datetime-local" hint="In your time zone" error={errors.due_at?.message} {...register("due_at", { required: "Choose when it is due" })} />
      <TextAreaField label="Details (optional)" error={errors.description?.message} {...register("description", { maxLength: { value: 50_000, message: "At most 50,000 characters" } })} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving..." : reminder ? "Save changes" : "Add reminder"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Adds a reminder that is not tied to a record (reminders on a record are added from its page),
 * or, with `reminder`, edits one. Editing leaves the record it belongs to untouched.
 */
export function ReminderFormDialog({
  open,
  onOpenChange,
  reminder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminder?: Reminder;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{reminder ? "Edit reminder" : "Add a reminder"}</DialogTitle>
          <DialogDescription>Add a title and when it is due.</DialogDescription>
        </DialogHeader>
        <ReminderFormBody key={reminder?.id ?? "new"} reminder={reminder} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
