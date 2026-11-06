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
import { fromDatetimeLocal } from "@/lib/format";
import { invalidateReminders } from "@/lib/keys";
import type { Reminder } from "@/lib/types";

type Values = { title: string; description: string; due_at: string };

function ReminderFormBody({ onDone }: { onDone: () => void }) {
  const client = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ defaultValues: { title: "", description: "", due_at: "" } });

  const save = useMutation({
    mutationFn: (v: Values) =>
      api<Reminder>("/reminders", {
        method: "POST",
        // datetime-local has no offset; the API rejects timestamps without one.
        body: {
          title: v.title.trim(),
          due_at: fromDatetimeLocal(v.due_at),
          ...(v.description.trim() ? { description: v.description.trim() } : {}),
        },
      }),
    onSuccess: async () => {
      await invalidateReminders(client);
      toast.success("Reminder added");
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
          {save.isPending ? "Adding..." : "Add reminder"}
        </Button>
      </div>
    </form>
  );
}

/** Adds a reminder that is not tied to a record. Reminders on a record are added from its page. */
export function ReminderFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a reminder</DialogTitle>
          <DialogDescription>Title and due time are required.</DialogDescription>
        </DialogHeader>
        <ReminderFormBody onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
