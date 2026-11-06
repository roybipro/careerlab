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
 *   ["contacts", "list", params]                   ["contacts", "detail", id]
 *   ["reminders", "list", params]                  ["reminders", "bell"]
 *   ["dashboard", "summary" | "deadlines" | "activity" | "analytics"]
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
  dashboardPart: (part: "summary" | "deadlines" | "activity" | "analytics") => ["dashboard", part] as const,
  reminderBell: ["reminders", "bell"] as const,
  reminderList: (params: unknown) => ["reminders", "list", params] as const,
};

/** After changing a job or research record: its lists and detail, its history, and the dashboard. */
export function invalidateEntity(client: QueryClient, type: EntityType, id: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: [RESOURCE[type]] }),
    client.invalidateQueries({ queryKey: ["activity", type, id] }),
    client.invalidateQueries({ queryKey: keys.dashboard }),
  ]);
}

/** After creating, changing or deleting a contact: every contact view, its history, and the dashboard (follow-ups). */
export function invalidateContacts(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ["contacts"] }),
    client.invalidateQueries({ queryKey: ["activity"] }),
    client.invalidateQueries({ queryKey: keys.dashboard }),
  ]);
}

/** After creating, completing or deleting a reminder: reminder lists, the header bell, and the dashboard. */
export function invalidateReminders(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ["reminders"] }),
    client.invalidateQueries({ queryKey: keys.dashboard }),
  ]);
}
