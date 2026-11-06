"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export const ME_KEY = ["me"] as const;

/** The signed-in user. A 401 is handled globally (redirect to /login), not here. */
export function useCurrentUser() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => api<User>("/auth/me"),
    staleTime: 5 * 60_000,
  });
}

const FALLBACK = "/dashboard";

/**
 * Accepts only same-site absolute paths ("/jobs?page=2"). Anything else, including
 * "//evil.com", "/\evil.com" and "https://evil.com", falls back to the dashboard.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return FALLBACK;
  if (/[\u0000-\u001f]/.test(next)) return FALLBACK;
  if (next === "/login" || next === "/register") return FALLBACK;
  return next;
}
