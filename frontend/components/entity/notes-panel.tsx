"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataState } from "@/components/data-state";
import { NativeSelect } from "@/components/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { NOTE_KINDS, type EntityType } from "@/lib/enums";
import { formatDateTime } from "@/lib/format";
import { keys } from "@/lib/keys";
import type { Note, Paginated } from "@/lib/types";

/** Notes written on one record, grouped by kind, with a form to add one. Works for any entity type. */
export function NotesPanel({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const client = useQueryClient();
  const queryKey = keys.notes(entityType, entityId);
  const query = useQuery({
    queryKey,
    queryFn: () =>
      api<Paginated<Note>>("/notes", {
        query: { entity_type: entityType, entity_id: entityId, page_size: 100, sort: "-created_at" },
      }),
  });

  const [kind, setKind] = useState("note");
  const [content, setContent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);

  const add = useMutation({
    mutationFn: () => api<Note>("/notes", { method: "POST", body: { entity_type: entityType, entity_id: entityId, kind, content } }),
    onSuccess: () => {
      setContent("");
      setFormError(null);
      void client.invalidateQueries({ queryKey });
    },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : "Could not save the note."),
  });

  const remove = useMutation({
    mutationFn: (note: Note) => api<void>(`/notes/${note.id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleting(null);
      void client.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      setDeleting(null);
      toast.error(e instanceof ApiError ? e.message : "Could not delete the note.");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!content.trim()) return setFormError("Write something first.");
            add.mutate();
          }}
        >
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <NativeSelect label="Kind" options={NOTE_KINDS} value={kind} onChange={(e) => setKind(e.target.value)} />
          <Textarea aria-label="Note" placeholder="Add a note" value={content} onChange={(e) => setContent(e.target.value)} />
          <Button type="submit" size="sm" disabled={add.isPending}>
            {add.isPending ? "Saving..." : "Add note"}
          </Button>
        </form>

        <DataState query={query} empty={<p className="text-sm text-muted-foreground">No notes yet. Add one above.</p>}>
          {(data) => (
            <div className="space-y-4">
              {NOTE_KINDS.filter((k) => data.items.some((n) => n.kind === k.value)).map((k) => (
                <section key={k.value} aria-label={k.label}>
                  <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{k.label}</h3>
                  <ul className="space-y-2">
                    {data.items
                      .filter((n) => n.kind === k.value)
                      .map((note) => (
                        <li key={note.id} className="rounded-lg border p-3">
                          <p className="text-sm break-words whitespace-pre-wrap">{note.content}</p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">{formatDateTime(note.created_at)}</span>
                            <Button variant="ghost" size="icon-xs" aria-label="Delete note" onClick={() => setDeleting(note)}>
                              <Trash2 />
                            </Button>
                          </div>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </DataState>
      </CardContent>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this note?"
        description="The note is deleted permanently."
        confirmLabel="Delete note"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Card>
  );
}
