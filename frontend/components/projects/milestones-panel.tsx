"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ListChecks, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { useRef, useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataState } from "@/components/data-state";
import { MilestoneProgress } from "@/components/projects/milestone-progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { daysFromToday, dueLabel, formatDateOnly } from "@/lib/format";
import { invalidateProject, keys } from "@/lib/keys";
import type { Paginated, ProjectMilestone } from "@/lib/types";
import { cn } from "@/lib/utils";

const WRAP = "[overflow-wrap:anywhere]";
const MAX_TITLE = 200;

type MilestoneList = Paginated<ProjectMilestone>;

/** Changes one milestone in the cached list and leaves the others as they are. */
function patchMilestone(client: QueryClient, projectId: string, id: string, patch: Partial<ProjectMilestone>) {
  client.setQueryData<MilestoneList>(keys.projectMilestones(projectId), (old) =>
    old ? { ...old, items: old.items.map((m) => (m.id === id ? { ...m, ...patch } : m)) } : old,
  );
}

function describe(e: unknown): string {
  if (e instanceof ApiError && e.details?.length) return e.details.map((d) => d.message).join(" ");
  return e instanceof ApiError ? e.message : "Something went wrong.";
}

function validateTitle(value: string): string | null {
  const title = value.trim();
  if (!title) return "Enter a title.";
  if (title.length > MAX_TITLE) return `At most ${MAX_TITLE} characters.`;
  return null;
}

type RowProps = {
  projectId: string;
  milestone: ProjectMilestone;
  /** Ticks that have not finished, across all rows. The list reloads only when this reaches zero. */
  inFlightRef: MutableRefObject<number>;
  onError: (message: string | null) => void;
  onDelete: () => void;
};

function MilestoneRow({ projectId, milestone, inFlightRef, onError, onDelete }: RowProps) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(milestone.title);
  const [due, setDue] = useState(milestone.due_date ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  // Each milestone is its own record with its own request. The change shows at once and only this
  // milestone goes back if the save fails, so ticking several quickly never undoes the others. Requests
  // for one milestone run in order (`scope`), so ticking and unticking it cannot arrive out of order.
  const toggle = useMutation({
    scope: { id: `milestone-${milestone.id}` },
    mutationFn: (is_done: boolean) => api<ProjectMilestone>(`/projects/${projectId}/milestones/${milestone.id}`, { method: "PATCH", body: { is_done } }),
    onMutate: async (is_done) => {
      inFlightRef.current += 1;
      onError(null);
      // Stop an in-flight reload from overwriting the change on screen.
      await client.cancelQueries({ queryKey: keys.projectMilestones(projectId) });
      patchMilestone(client, projectId, milestone.id, { is_done });
    },
    onError: (e, is_done) => {
      patchMilestone(client, projectId, milestone.id, { is_done: !is_done });
      const message = `Could not save "${milestone.title}". It shows what is saved. ${describe(e)}`;
      onError(message);
      toast.error(message);
    },
    onSettled: async () => {
      inFlightRef.current -= 1;
      // Reload only after the last tick, so a reload cannot undo a tick still on its way.
      if (inFlightRef.current === 0) await invalidateProject(client, projectId);
    },
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<ProjectMilestone>(`/projects/${projectId}/milestones/${milestone.id}`, { method: "PATCH", body }),
    onSuccess: async () => {
      setEditing(false);
      setFormError(null);
      await invalidateProject(client, projectId);
      toast.success("Milestone updated");
    },
    onError: (e) => setFormError(describe(e)),
  });

  function startEditing() {
    setTitle(milestone.title);
    setDue(milestone.due_date ?? "");
    setFormError(null);
    setEditing(true);
  }

  function submit() {
    const problem = validateTitle(title);
    if (problem) return setFormError(problem);
    const body: Record<string, unknown> = {};
    if (title.trim() !== milestone.title) body.title = title.trim();
    if (due !== (milestone.due_date ?? "")) body.due_date = due === "" ? null : due;
    if (Object.keys(body).length === 0) return setEditing(false);
    save.mutate(body);
  }

  if (editing) {
    return (
      <li className="py-3">
        <form
          noValidate
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input aria-label="Milestone title" value={title} aria-invalid={formError ? true : undefined} onChange={(e) => setTitle(e.target.value)} />
            <Input aria-label="Due date" type="date" className="sm:w-44" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Save"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={save.isPending} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  const days = milestone.due_date && !milestone.is_done ? daysFromToday(milestone.due_date) : null;
  const overdue = days !== null && days < 0;

  return (
    <li className="flex items-center gap-1">
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-md px-1.5 py-3 hover:bg-muted md:py-1.5">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={milestone.is_done} onChange={() => toggle.mutate(!milestone.is_done)} />
        <span className="min-w-0">
          <span className={cn("block text-sm", WRAP, milestone.is_done && "text-muted-foreground line-through")}>{milestone.title}</span>
          {milestone.due_date ? (
            <span className={cn("flex flex-wrap items-center gap-x-1.5 text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
              {overdue ? <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" /> : null}
              <span>Due {formatDateOnly(milestone.due_date)}</span>
              {overdue && days !== null ? <span>· Overdue, {dueLabel(days)}</span> : null}
            </span>
          ) : null}
        </span>
      </label>
      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${milestone.title}`} onClick={startEditing}>
        <Pencil aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${milestone.title}`} onClick={onDelete}>
        <Trash2 aria-hidden="true" />
      </Button>
    </li>
  );
}

/** A project's milestones as a checklist, with progress, inline add and edit, and delete. */
export function MilestonesPanel({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: keys.projectMilestones(projectId),
    queryFn: () => api<MilestoneList>(`/projects/${projectId}/milestones`, { query: { page_size: 100 } }),
  });
  const inFlight = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProjectMilestone | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<ProjectMilestone>(`/projects/${projectId}/milestones`, { method: "POST", body }),
    onSuccess: async () => {
      setTitle("");
      setDue("");
      setFormError(null);
      await invalidateProject(client, projectId);
    },
    onError: (e) => setFormError(describe(e)),
  });

  const remove = useMutation({
    mutationFn: (m: ProjectMilestone) => api<void>(`/projects/${projectId}/milestones/${m.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setDeleting(null);
      await invalidateProject(client, projectId);
      toast.success("Milestone deleted");
    },
    onError: (e) => {
      setDeleting(null);
      toast.error(describe(e));
    },
  });

  function submitAdd() {
    const problem = validateTitle(title);
    if (problem) return setFormError(problem);
    setFormError(null);
    add.mutate({ title: title.trim(), ...(due ? { due_date: due } : {}) });
  }

  const items = query.data?.items ?? [];
  const done = items.filter((m) => m.is_done).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <ListChecks aria-hidden="true" />
          Milestones
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {items.length > 0 ? <MilestoneProgress done={done} total={items.length} /> : null}
        <DataState query={query} empty={<p className="text-sm text-muted-foreground">No milestones yet. Break the project into steps, such as a literature review or a first draft.</p>}>
          {(data) => (
            <ul className="space-y-0.5">
              {data.items.map((m) => (
                <MilestoneRow key={m.id} projectId={projectId} milestone={m} inFlightRef={inFlight} onError={setError} onDelete={() => setDeleting(m)} />
              ))}
            </ul>
          )}
        </DataState>
        <form
          noValidate
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            submitAdd();
          }}
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="New milestone title"
              placeholder="Add a milestone, for example First draft"
              value={title}
              aria-invalid={formError ? true : undefined}
              onChange={(e) => {
                setTitle(e.target.value);
                setFormError(null);
              }}
            />
            <Input aria-label="New milestone due date" type="date" className="sm:w-44" value={due} onChange={(e) => setDue(e.target.value)} />
            <Button type="submit" variant="outline" disabled={add.isPending}>
              {add.isPending ? "Adding..." : "Add"}
            </Button>
          </div>
          {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
        </form>
      </CardContent>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.title ?? ""}"?`}
        description="This cannot be undone."
        confirmLabel="Delete milestone"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Card>
  );
}
