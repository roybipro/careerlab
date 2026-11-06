"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { invalidateEntity } from "@/lib/keys";
import type { Research } from "@/lib/types";

type ListField = "required_documents" | "publication_links";

function describeError(e: unknown): string {
  if (e instanceof ApiError && e.details?.length) return e.details.map((d) => d.message).join(" ");
  return e instanceof ApiError ? e.message : "Something went wrong.";
}

/**
 * A list on a research record that the API saves as a whole through PATCH (the document
 * checklist, the publication links).
 *
 * - The screen shows `draft` (the latest list the user made) until every save has finished.
 * - Saves run one after another, and each sends the latest list at the moment it runs, so
 *   rapid clicks never lose a change and a slow earlier request cannot overwrite a later one.
 * - When the last save ends the record is reloaded and the draft dropped, so a failed save
 *   puts the list back to what the server has. The error stays visible in `error`.
 */
export function useSavedList<T>(research: Research, field: ListField) {
  const client = useQueryClient();
  const id = research.id;
  const [draft, setDraft] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<T[]>([]);
  const inFlight = useRef(0);

  const mutation = useMutation({
    mutationKey: ["research", "save-list", id, field],
    scope: { id: `research-${id}-${field}` },
    mutationFn: () => api<Research>(`/research/${id}`, { method: "PATCH", body: { [field]: latest.current } }),
    onError: (e) => {
      const message = describeError(e);
      setError(message);
      toast.error(`Could not save. ${message}`);
    },
    onSettled: async () => {
      inFlight.current -= 1;
      if (inFlight.current > 0) return;
      await invalidateEntity(client, "research", id);
      // A click during the reload started a new save: keep its draft.
      if (inFlight.current === 0) setDraft(null);
    },
  });

  const items = draft ?? (research[field] as T[]);

  function save(next: T[]) {
    latest.current = next;
    inFlight.current += 1;
    setError(null);
    setDraft(next);
    mutation.mutate();
  }

  return { items, save, error, saving: draft !== null };
}
