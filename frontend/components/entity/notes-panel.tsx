"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
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

/** One note, with an inline editor. Editing keeps the note's original timestamp. */
function NoteItem({ note, fixedKind, onDelete, onSaved }: { note: Note; fixedKind?: string; onDelete: () => void; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [kind, setKind] = useState(note.kind);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api<Note>(`/notes/${note.id}`, { method: "PATCH", body: { content, kind } }),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      onSaved();
      toast.success("Note updated");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not save the note."),
  });

  function startEditing() {
    setContent(note.content);
    setKind(note.kind);
    setError(null);
    setEditing(true);
  }

  if (editing) {
    return (
      <li className="rounded-lg border p-3">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!content.trim()) return setError("Write something first.");
            save.mutate();
          }}
        >
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {fixedKind ? null : <NativeSelect label="Kind" options={NOTE_KINDS} value={kind} onChange={(e) => setKind(e.target.value)} />}
          <Textarea aria-label="Edit note" value={content} onChange={(e) => setContent(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-lg border p-3">
      <p className="text-sm break-words whitespace-pre-wrap">{note.content}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{formatDateTime(note.created_at)}</span>
        <span className="flex gap-1">
          <Button variant="ghost" size="icon-xs" aria-label="Edit note" onClick={startEditing}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Delete note" onClick={onDelete}>
            <Trash2 />
          </Button>
        </span>
      </div>
    </li>
  );
}

type NotesPanelProps = {
  entityType: EntityType;
  entityId: string;
  /** Show and add only this kind of note (for example "communication"). Omit to show every kind, grouped. */
  kind?: string;
  /** Card heading. Defaults to "Notes". */
  title?: string;
};

/** Notes written on one record, grouped by kind, with a form to add one and edit and delete on each. Works for any entity type. */
export function NotesPanel({ entityType, entityId, kind: fixedKind, title = "Notes" }: NotesPanelProps) {
  const client = useQueryClient();
  const baseKey = keys.notes(entityType, entityId);
  const queryKey = fixedKind ? [...baseKey, fixedKind] : baseKey;
  const query = useQuery({
    queryKey,
    queryFn: () =>
      api<Paginated<Note>>("/notes", {
        query: { entity_type: entityType, entity_id: entityId, kind: fixedKind, page_size: 100, sort: "-created_at" },
      }),
  });

  const [pickedKind, setKind] = useState("note");
  const kind = fixedKind ?? pickedKind;
  const [content, setContent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);

  const add = useMutation({
    mutationFn: () => api<Note>("/notes", { method: "POST", body: { entity_type: entityType, entity_id: entityId, kind, content } }),
    onSuccess: () => {
      setContent("");
      setFormError(null);
      void client.invalidateQueries({ queryKey: baseKey });
    },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : "Could not save the note."),
  });

  const remove = useMutation({
    mutationFn: (note: Note) => api<void>(`/notes/${note.id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleting(null);
      void client.invalidateQueries({ queryKey: baseKey });
    },
    onError: (e) => {
      setDeleting(null);
      toast.error(e instanceof ApiError ? e.message : "Could not delete the note.");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
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
          {fixedKind ? null : <NativeSelect label="Kind" options={NOTE_KINDS} value={kind} onChange={(e) => setKind(e.target.value)} />}
          <Textarea aria-label={fixedKind ? title : "Note"} placeholder={fixedKind ? "Log a call, email or message" : "Add a note"} value={content} onChange={(e) => setContent(e.target.value)} />
          <Button type="submit" size="sm" disabled={add.isPending}>
            {add.isPending ? "Saving..." : fixedKind ? "Add entry" : "Add note"}
          </Button>
        </form>

        <DataState query={query} empty={<p className="text-sm text-muted-foreground">{fixedKind ? "Nothing logged yet. Add the first entry above." : "No notes yet. Add one above."}</p>}>
          {(data) => (
            <div className="space-y-4">
              {NOTE_KINDS.filter((k) => data.items.some((n) => n.kind === k.value)).map((k) => (
                <section key={k.value} aria-label={k.label}>
                  <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{k.label}</h3>
                  <ul className="space-y-2">
                    {data.items
                      .filter((n) => n.kind === k.value)
                      .map((note) => (
                        <NoteItem
                          key={note.id}
                          note={note}
                          fixedKind={fixedKind}
                          onDelete={() => setDeleting(note)}
                          onSaved={() => void client.invalidateQueries({ queryKey: baseKey })}
                        />
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
