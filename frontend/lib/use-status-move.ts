"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { statusLabel, type EntityType } from "@/lib/enums";
import { entityResource, invalidateEntity, invalidateProject } from "@/lib/keys";
import type { Paginated } from "@/lib/types";

/**
 * Kanban status change for a job, research or project list: the card moves at once, goes back
 * with a toast if the save fails, and the lists, activity and dashboard refresh afterwards.
 * `path` is the collection endpoint ("/jobs"); `nameOf` names the item in the error toast.
 * `field` is the property that holds the column ("status", or "stage" for projects).
 */
export function useStatusMove<T extends { id: string }>(type: EntityType, path: string, nameOf: (item: T) => string, field: string = "status") {
  const client = useQueryClient();
  const resource = entityResource(type);

  function setStatusInLists(id: string, status: string) {
    client.setQueriesData<Paginated<T>>({ queryKey: [resource, "list"] }, (old) =>
      old ? { ...old, items: old.items.map((item) => (item.id === id ? { ...item, [field]: status } : item)) } : old,
    );
  }

  return useMutation({
    mutationFn: ({ item, status }: { item: T; status: string }) => api<T>(`${path}/${item.id}`, { method: "PATCH", body: { [field]: status } }),
    onMutate: async ({ item, status }) => {
      // Stop in-flight refetches from overwriting the optimistic status.
      await client.cancelQueries({ queryKey: [resource] });
      setStatusInLists(item.id, status);
    },
    onError: (error, { item, status }) => {
      setStatusInLists(item.id, (item as Record<string, unknown>)[field] as string);
      const reason = error instanceof ApiError ? error.message : "Something went wrong.";
      toast.error(`Could not move ${nameOf(item)} to ${statusLabel(status)}. ${reason}`);
    },
    onSettled: (_data, _error, { item }) => (type === "project" ? invalidateProject(client, item.id) : invalidateEntity(client, type, item.id)),
  });
}
