import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { ApiErrorDetail } from "@/lib/types";

const BASE = "/api/v1";
const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export class ApiError extends Error {
  status: number;
  code: string;
  details: ApiErrorDetail[] | null;

  constructor(status: number, code: string, message: string, details: ApiErrorDetail[] | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type QueryValue = string | number | boolean | null | undefined;

export type ApiInit = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Null, undefined and empty-string values are left out of the URL. */
  query?: Record<string, QueryValue | QueryValue[]>;
};

function buildUrl(path: string, query: ApiInit["query"]): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v !== null && v !== undefined && v !== "") params.append(key, String(v));
    }
  }
  const qs = params.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ""}`;
}

/**
 * Typed fetch wrapper for the CareerLab API. `path` is relative to /api/v1 (e.g. "/jobs").
 * Adds the CSRF header on mutations. Throws ApiError for every failure, including network
 * errors (status 0) and non-JSON bodies, error or success, such as a proxy page.
 */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (MUTATING.has(method)) headers["X-Requested-With"] = "CareerLab";
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(buildUrl(path, init.query), {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network_error", "Could not reach the server. Check your connection and try again.");
  }

  if (res.ok) {
    if (res.status === 204) return undefined as T;
    try {
      return (await res.json()) as T;
    } catch {
      // A 2xx that is not JSON is a proxy or hosting page (for example a sleeping server's
      // loading page). Report it as a gateway error, which the query client retries.
      throw new ApiError(502, "bad_response", "The server sent an unexpected response. Try again in a moment.");
    }
  }

  let payload: { error?: { code?: string; message?: string; details?: ApiErrorDetail[] | null } } | null = null;
  try {
    payload = await res.json();
  } catch {
    // Not JSON (for example a gateway error page).
  }
  const err = payload?.error;
  throw new ApiError(
    res.status,
    err?.code ?? "http_error",
    err?.message ?? (res.status >= 500 ? "The server is unavailable. Try again in a moment." : "Request failed."),
    Array.isArray(err?.details) ? err.details : null,
  );
}

/**
 * Puts server validation errors on the matching form fields. Returns the messages that
 * did not match a field so the form can show them as a general error.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | null {
  if (!(error instanceof ApiError)) return "Something went wrong. Try again.";
  const unmatched: string[] = [];
  for (const d of error.details ?? []) {
    const field = d.loc.find((part): part is Path<T> => fields.includes(part as Path<T>));
    if (field) setError(field, { type: "server", message: d.message });
    else unmatched.push(d.message);
  }
  if (error.details?.length) return unmatched.length ? unmatched.join(" ") : null;
  return error.message;
}
