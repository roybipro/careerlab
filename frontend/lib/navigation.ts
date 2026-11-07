/**
 * Leaves the current page with a full page load instead of the client router.
 *
 * Used when the session changes (login, register, logout, expiry). It drops every
 * in-memory cache, and it avoids the client router replaying a redirect it cached while
 * the user was signed out (which would bounce a fresh login straight back to /login).
 */
export function hardNavigate(path: string) {
  window.location.assign(path);
}

const ENTITY_PATH: Record<string, string> = { job: "jobs", research: "research", project: "projects" };

/** The detail page of a job, research opportunity, research project or contact. */
export function entityHref(type: string, id: string): string {
  return `/${ENTITY_PATH[type] ?? "contacts"}/${id}`;
}
