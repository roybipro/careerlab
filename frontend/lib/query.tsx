"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { hardNavigate } from "@/lib/navigation";

const AUTH_PATHS = ["/login", "/register"];

let redirecting = false;

/** Call before leaving the session on purpose (logout) so the 401 handler stays quiet. */
export function markSessionEnding() {
  redirecting = true;
}

/**
 * Any 401 means the session is gone: drop cached data and go to /login. Skipped on the
 * auth pages, where a 401 just means a wrong password.
 */
function handleUnauthorized(error: unknown, client: QueryClient) {
  if (!(error instanceof ApiError) || error.status !== 401) return;
  const { pathname, search } = window.location;
  if (AUTH_PATHS.includes(pathname) || redirecting) return;
  redirecting = true;
  client.clear();
  hardNavigate(`/login?next=${encodeURIComponent(pathname + search)}`);
}

function makeClient() {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => handleUnauthorized(error, client) }),
    mutationCache: new MutationCache({ onError: (error) => handleUnauthorized(error, client) }),
    defaultOptions: {
      queries: {
        // "always": when the browser is offline, fetch fails and the error/retry paths run,
        // instead of the query pausing forever in a loading state.
        networkMode: "always",
        staleTime: 30_000,
        // Never retry 4xx. Retry network and 5xx errors twice.
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false, networkMode: "always" },
    },
  });
  return client;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);

  // A page restored from the back-forward cache keeps its old DOM and JS state (including a
  // signed-in view after logout, and the `redirecting` flag above). Reload so it is rebuilt
  // from the server, which redirects signed-out visitors to /login.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
