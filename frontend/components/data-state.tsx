"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { AlertCircle, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WakingHint } from "@/components/waking-hint";

type DataStateProps<T> = {
  query: UseQueryResult<T>;
  /** Shown while the first load is in flight. Defaults to a few grey bars. */
  skeleton?: ReactNode;
  /** Shown when the query succeeded but there is nothing to list. */
  empty?: ReactNode;
  /** Custom emptiness test. By default: empty arrays, `{ items: [] }`, null and undefined. */
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
};

function defaultIsEmpty(data: unknown): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === "object" && "items" in data && Array.isArray((data as { items: unknown }).items)) {
    return (data as { items: unknown[] }).items.length === 0;
  }
  return false;
}

export function DataSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function ErrorState({ error, onRetry, retrying }: { error: Error; onRetry: () => void; retrying?: boolean }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>Could not load this</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{error.message}</span>
        <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
          {retrying ? "Retrying..." : "Retry"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <Inbox className="size-6 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-sm font-medium">{title}</h2>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * Renders the four states of a query: loading, error with retry, empty, and success.
 * Every data view uses this so failures are never a blank page or an endless spinner.
 */
export function DataState<T>({ query, skeleton, empty, isEmpty = defaultIsEmpty, children }: DataStateProps<T>) {
  if (query.isPending) {
    return (
      <>
        {skeleton ?? <DataSkeleton />}
        <WakingHint className="mt-3 text-sm text-muted-foreground" />
      </>
    );
  }
  const retry = () => void query.refetch();
  // No data at all: full error state.
  if (query.isError && query.data === undefined) {
    return <ErrorState error={query.error} onRetry={retry} retrying={query.isFetching} />;
  }
  // A background refetch failed but earlier data is still here: keep the view and say so.
  const stale = query.isError ? (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle />
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>Could not refresh. Showing the last loaded data.</span>
        <Button variant="outline" size="sm" onClick={retry} disabled={query.isFetching}>
          {query.isFetching ? "Retrying..." : "Retry"}
        </Button>
      </AlertDescription>
    </Alert>
  ) : null;
  const body = isEmpty(query.data as T) ? (empty ?? <EmptyState title="Nothing here yet" />) : children(query.data as T);
  return (
    <>
      {stale}
      {body}
    </>
  );
}
