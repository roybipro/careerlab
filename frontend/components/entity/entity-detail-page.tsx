"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileQuestion, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataSkeleton, DataState, EmptyState } from "@/components/data-state";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { EntityType } from "@/lib/enums";
import { entityResource, keys } from "@/lib/keys";
import { cn } from "@/lib/utils";

type EntityDetailPageProps<T extends { id: string }> = {
  type: EntityType;
  id: string;
  /** Collection endpoint, "/jobs". Also the list page route, so it must match the app route. */
  path: string;
  /** "job", "research opportunity": used in the not-found text and toasts. */
  noun: string;
  backLabel: string;
  title: (item: T) => string;
  description: (item: T) => string;
  deleteDescription: string;
  /** Badges under the header. */
  badges: (item: T) => ReactNode;
  /** The page body below the badges. */
  children: (item: T) => ReactNode;
  /** The edit dialog. Rendered once the record has loaded. */
  renderEdit: (item: T, open: boolean, onOpenChange: (open: boolean) => void) => ReactNode;
};

/** Load, 404 state, header with Edit and Delete, delete confirmation. Shared by the job and research pages. */
export function EntityDetailPage<T extends { id: string }>({
  type,
  id,
  path,
  noun,
  backLabel,
  title,
  description,
  deleteDescription,
  badges,
  children,
  renderEdit,
}: EntityDetailPageProps<T>) {
  const router = useRouter();
  const client = useQueryClient();
  const resource = entityResource(type);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const query = useQuery({
    queryKey: keys.detail(type, id),
    queryFn: () => api<T>(`${path}/${id}`),
  });

  const remove = useMutation({
    mutationFn: () => api<void>(`${path}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      // Drop the detail first so nothing refetches a record that no longer exists.
      client.removeQueries({ queryKey: keys.detail(type, id) });
      void client.invalidateQueries({ queryKey: [resource, "list"] });
      void client.invalidateQueries({ queryKey: ["link-options"] });
      void client.invalidateQueries({ queryKey: ["reminders"] });
      void client.invalidateQueries({ queryKey: ["contacts"] });
      void client.invalidateQueries({ queryKey: keys.dashboard });
      toast.success(`${noun.charAt(0).toUpperCase()}${noun.slice(1)} deleted`);
      router.replace(path);
    },
    onError: (e) => {
      setConfirmingDelete(false);
      toast.error(e instanceof ApiError ? e.message : `Could not delete the ${noun}.`);
    },
  });

  const error = query.error;
  // 404 is a missing or foreign record. 422 is an id that is not even a UUID. Neither is worth a retry.
  if (query.isError && query.data === undefined && error instanceof ApiError && (error.status === 404 || error.status === 422)) {
    return (
      <EmptyState
        icon={FileQuestion}
        title={`${noun.charAt(0).toUpperCase()}${noun.slice(1)} not found`}
        description="It may have been deleted, or the link is wrong."
        action={
          <Link href={path} className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft data-icon="inline-start" />
            Back to {backLabel.toLowerCase()}
          </Link>
        }
      />
    );
  }

  return (
    <>
      <Link href={path} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-3 -ml-2.5 text-muted-foreground")}>
        <ArrowLeft data-icon="inline-start" />
        {backLabel}
      </Link>
      <DataState query={query} skeleton={<DataSkeleton />}>
        {(item) => (
          <>
            <PageHeader
              title={title(item)}
              description={description(item)}
              actions={
                <>
                  <Button onClick={() => setEditing(true)}>
                    <Pencil data-icon="inline-start" />
                    Edit
                  </Button>
                  <Button variant="ghost" className="text-destructive hover:bg-destructive-soft hover:text-destructive" onClick={() => setConfirmingDelete(true)}>
                    <Trash2 data-icon="inline-start" />
                    Delete
                  </Button>
                </>
              }
            />
            <div className="-mt-4 mb-6 flex flex-wrap gap-2">{badges(item)}</div>
            {children(item)}
            {renderEdit(item, editing, setEditing)}
            <ConfirmDialog
              open={confirmingDelete}
              onOpenChange={setConfirmingDelete}
              title={`Delete ${title(item)}?`}
              description={deleteDescription}
              confirmLabel={`Delete ${noun}`}
              pending={remove.isPending}
              onConfirm={() => remove.mutate()}
            />
          </>
        )}
      </DataState>
    </>
  );
}
