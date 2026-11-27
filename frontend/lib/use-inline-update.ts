"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
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
 *
 * Quick repeat edits are safe: a failed save only rolls back the fields no later edit has
 * touched since, and the refresh waits until the last inline edit of that resource settles,
 * so an older value never flashes back over a newer one.
 */
export function useInlineUpdate<T extends { id: string }>(type: EntityType, path: string, nameOf: (item: T) => string) {
  const client = useQueryClient();
  const resource = entityResource(type);
  const mutationKey = [resource, "inline-update"];
  // The latest edit number for each "row id:field", so a stale failure knows not to roll back.
  const latest = useRef(new Map<string, number>());
  const counter = useRef(0);

  function patchLists(id: string, changes: Record<string, unknown>) {
    client.setQueriesData<Paginated<T>>({ queryKey: [resource, "list"] }, (old) =>
      old ? { ...old, items: old.items.map((item) => (item.id === id ? { ...item, ...changes } : item)) } : old,
    );
  }

  return useMutation({
    mutationKey,
    mutationFn: ({ item, changes }: { item: T; changes: Changes }) => api<T>(`${path}/${item.id}`, { method: "PATCH", body: changes }),
    onMutate: async ({ item, changes }) => {
      const seq = ++counter.current;
      for (const key of Object.keys(changes)) latest.current.set(`${item.id}:${key}`, seq);
      // Stop in-flight refetches from overwriting the optimistic value.
      await client.cancelQueries({ queryKey: [resource] });
      patchLists(item.id, changes);
      return { seq };
    },
    onError: (error, { item, changes }, context) => {
      const stillOurs = Object.keys(changes).filter((key) => latest.current.get(`${item.id}:${key}`) === context?.seq);
      if (stillOurs.length) {
        const previous = Object.fromEntries(stillOurs.map((key) => [key, (item as Record<string, unknown>)[key]]));
        patchLists(item.id, previous);
      }
      const reason = error instanceof ApiError ? error.message : "Something went wrong.";
      toast.error(`Could not update ${nameOf(item)}. ${reason}`);
    },
    onSettled: (_data, _error, { item }) => {
      // This mutation still counts as running here, so 1 means it is the last one.
      if (client.isMutating({ mutationKey }) > 1) return;
      return type === "project" ? invalidateProject(client, item.id) : invalidateEntity(client, type, item.id);
    },
  });
}
