import type { QueryClient } from "@tanstack/react-query";
import type { EntityType } from "@/lib/enums";

/**
 * Query key scheme. Every key starts with the resource, so one invalidation by prefix
 * covers every list and detail of that resource.
 *
 *   ["jobs", "list", params]            ["jobs", "detail", id]
 *   ["research", "list", params]        ["research", "detail", id]
 *   ["notes", entityType, entityId]
 *   ["activity", entityType, entityId]
 *   ["contacts", "linked", entityType, entityId]   ["contacts", "options", search]
 *   ["reminders", "related", relatedType, relatedId]
 *   ["dashboard"]                       (summary, activity, deadlines: Task 11)
 */
const RESOURCE: Record<EntityType, string> = { job: "jobs", research: "research", contact: "contacts" };

export const entityResource = (type: EntityType) => RESOURCE[type];

export const keys = {
  list: (type: EntityType, params: unknown) => [RESOURCE[type], "list", params] as const,
  detail: (type: EntityType, id: string) => [RESOURCE[type], "detail", id] as const,
  notes: (type: EntityType, id: string) => ["notes", type, id] as const,
  activity: (type: EntityType, id: string) => ["activity", type, id] as const,
  linkedContacts: (type: EntityType, id: string) => ["contacts", "linked", type, id] as const,
  contactOptions: (search: string) => ["contacts", "options", search] as const,
  reminders: (type: EntityType, id: string) => ["reminders", "related", type, id] as const,
  dashboard: ["dashboard"] as const,
};

/** After changing a job or research record: its lists and detail, its history, and the dashboard. */
export function invalidateEntity(client: QueryClient, type: EntityType, id: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: [RESOURCE[type]] }),
    client.invalidateQueries({ queryKey: ["activity", type, id] }),
    client.invalidateQueries({ queryKey: keys.dashboard }),
  ]);
}
