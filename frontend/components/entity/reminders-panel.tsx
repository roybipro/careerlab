"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataState } from "@/components/data-state";
import { TextField } from "@/components/text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, applyServerErrors, ApiError } from "@/lib/api";
import type { EntityType } from "@/lib/enums";
import { formatDateTime, fromDatetimeLocal } from "@/lib/format";
import { invalidateReminders, keys } from "@/lib/keys";
import type { Paginated, Reminder } from "@/lib/types";

type Values = { title: string; due_at: string };

/** Reminders attached to one record, with add, complete and delete. Works for any entity type. */
export function RemindersPanel({ relatedType, relatedId }: { relatedType: EntityType; relatedId: string }) {
  const client = useQueryClient();
  const queryKey = keys.reminders(relatedType, relatedId);
  const query = useQuery({
    queryKey,
    queryFn: () =>
      api<Paginated<Reminder>>("/reminders", {
        query: { related_type: relatedType, related_id: relatedId, page_size: 100, sort: "due_at" },
      }),
  });

  // Reminders feed the dashboard and the reminders page, so refresh those too.
  const refresh = () => invalidateReminders(client);

  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Reminder | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({ defaultValues: { title: "", due_at: "" } });

  const add = useMutation({
    mutationFn: (v: Values) =>
      api<Reminder>("/reminders", {
        method: "POST",
        // datetime-local has no offset; the API rejects timestamps without one.
        body: { title: v.title.trim(), due_at: fromDatetimeLocal(v.due_at), related_type: relatedType, related_id: relatedId },
      }),
    onSuccess: () => {
      reset();
      setFormError(null);
      void refresh();
    },
    onError: (e) => setFormError(applyServerErrors(e, setError, ["title", "due_at"])),
  });

  const toggle = useMutation({
    mutationFn: (r: Reminder) => api<Reminder>(`/reminders/${r.id}`, { method: "PATCH", body: { is_completed: !r.is_completed } }),
    onSuccess: () => void refresh(),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not update the reminder."),
  });

  const remove = useMutation({
    mutationFn: (r: Reminder) => api<void>(`/reminders/${r.id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleting(null);
      void refresh();
    },
    onError: (e) => {
      setDeleting(null);
      toast.error(e instanceof ApiError ? e.message : "Could not delete the reminder.");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reminders</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          noValidate
          className="space-y-2"
          onSubmit={handleSubmit((v) => {
            setFormError(null);
            add.mutate(v);
          })}
        >
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <TextField label="Reminder" placeholder="Follow up with the recruiter" error={errors.title?.message} {...register("title", { validate: (v) => v.trim() !== "" || "Enter a title" })} />
          <TextField label="Due" type="datetime-local" error={errors.due_at?.message} {...register("due_at", { required: "Choose when it is due" })} />
          <Button type="submit" size="sm" disabled={add.isPending}>
            {add.isPending ? "Adding..." : "Add reminder"}
          </Button>
        </form>

        <DataState query={query} empty={<p className="text-sm text-muted-foreground">No reminders yet. Add one above.</p>}>
          {(data) => (
            <ul className="space-y-2">
              {data.items.map((r) => (
                <li key={r.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={r.is_completed}
                    disabled={toggle.isPending}
                    aria-label={`Mark "${r.title}" ${r.is_completed ? "not done" : "done"}`}
                    onChange={() => toggle.mutate(r)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={r.is_completed ? "text-sm break-words text-muted-foreground line-through" : "text-sm break-words"}>{r.title}</p>
                    <p className="text-xs text-muted-foreground">Due {formatDateTime(r.due_at)}</p>
                  </div>
                  <Button variant="ghost" size="icon-xs" aria-label={`Delete reminder ${r.title}`} onClick={() => setDeleting(r)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DataState>
      </CardContent>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this reminder?"
        description="The reminder is deleted permanently."
        confirmLabel="Delete reminder"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Card>
  );
}
