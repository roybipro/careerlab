"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { EntityType } from "@/lib/enums";
import { entityResource, keys } from "@/lib/keys";

/** "1 job", "3 jobs". */
export type Noun = { one: string; many: string };
export const count = (n: number, noun: Noun) => `${n} ${n === 1 ? noun.one : noun.many}`;

/**
 * Changes or deletes several rows of a list in one request. The API applies all of them or
 * none, so a failure leaves every row as it was. Lists, activity, the dashboard and the
 * pickers refresh afterwards; a delete also refreshes the notes, reminders and contact links
 * that went with the deleted rows.
 */
export function useBulkActions(type: EntityType, path: string, noun: Noun) {
  const client = useQueryClient();
  const resource = entityResource(type);

  function refresh(deleted: boolean) {
    const prefixes: readonly (readonly string[])[] = [
      [resource],
      ["link-options"],
      ["activity"],
      keys.dashboard,
      ...(deleted ? [["notes"], ["reminders"], ["contacts"]] : []),
    ];
    return Promise.all(prefixes.map((queryKey) => client.invalidateQueries({ queryKey })));
  }

  const failed = (what: string) => (error: Error) => {
    const reason = error instanceof ApiError ? error.message : "Something went wrong.";
    toast.error(`Could not ${what}. Nothing was changed. ${reason}`);
  };

  const update = useMutation({
    mutationFn: ({ ids, changes }: { ids: string[]; changes: Record<string, string> }) =>
      api<void>(`${path}/bulk-update`, { method: "POST", body: { ids, changes } }),
    onSuccess: (_data, { ids }) => toast.success(`Updated ${count(ids.length, noun)}`),
    onError: failed(`update the ${noun.many}`),
    onSettled: () => refresh(false),
  });

  const remove = useMutation({
    mutationFn: ({ ids }: { ids: string[] }) => api<void>(`${path}/bulk-delete`, { method: "POST", body: { ids } }),
    onSuccess: (_data, { ids }) => toast.success(`Deleted ${count(ids.length, noun)}`),
    onError: failed(`delete the ${noun.many}`),
    onSettled: () => refresh(true),
  });

  return { update, remove };
}
