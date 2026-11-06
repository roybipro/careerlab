"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { AlertCircle, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
  if (query.isPending) return <>{skeleton ?? <DataSkeleton />}</>;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  if (isEmpty(query.data)) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return <>{children(query.data)}</>;
}
