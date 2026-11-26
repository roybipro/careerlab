"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { EntityType } from "@/lib/enums";
import { entityResource, invalidateEntity, invalidateProject } from "@/lib/keys";
import type { Paginated } from "@/lib/types";

type Changes = Record<string, string | null>;

/**
 * Edits one or more fields of a row straight from a list (status, priority, a date).
 * The row changes at once, goes back with a toast if the save fails, and the lists,
 * detail page, activity and dashboard refresh afterwards. Same pattern as the Kanban move.
 */
export function useInlineUpdate<T extends { id: string }>(type: EntityType, path: string, nameOf: (item: T) => string) {
  const client = useQueryClient();
  const resource = entityResource(type);

  function patchLists(id: string, changes: Record<string, unknown>) {
    client.setQueriesData<Paginated<T>>({ queryKey: [resource, "list"] }, (old) =>
      old ? { ...old, items: old.items.map((item) => (item.id === id ? { ...item, ...changes } : item)) } : old,
    );
  }

  return useMutation({
    mutationFn: ({ item, changes }: { item: T; changes: Changes }) => api<T>(`${path}/${item.id}`, { method: "PATCH", body: changes }),
    onMutate: async ({ item, changes }) => {
      // Stop in-flight refetches from overwriting the optimistic value.
      await client.cancelQueries({ queryKey: [resource] });
      patchLists(item.id, changes);
    },
    onError: (error, { item, changes }) => {
      const previous = Object.fromEntries(Object.keys(changes).map((key) => [key, (item as Record<string, unknown>)[key]]));
      patchLists(item.id, previous);
      const reason = error instanceof ApiError ? error.message : "Something went wrong.";
      toast.error(`Could not update ${nameOf(item)}. ${reason}`);
    },
    onSettled: (_data, _error, { item }) => (type === "project" ? invalidateProject(client, item.id) : invalidateEntity(client, type, item.id)),
  });
}
