"use client";

import { Kanban, ListFilter, Search, Table2, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NativeSelect } from "@/components/native-select";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Option } from "@/lib/enums";

export type ToolbarFilter =
  | { type: "select"; key: string; label: string; options: Option[] }
  | { type: "date"; key: string; label: string }
  | { type: "text"; key: string; label: string };

/** A free-text filter. Typing waits 300 ms before it reaches the URL; an outside change (Clear, Back) replaces the text. */
function TextFilter({ filter }: { filter: { key: string; label: string } }) {
  const { get, update } = useListParams();
  const urlValue = get(filter.key);
  const [text, setText] = useState(urlValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef(urlValue);

  useEffect(() => {
    if (timer.current || urlValue === lastSent.current) return;
    lastSent.current = urlValue;
    setText(urlValue);
  }, [urlValue]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <TextField
      label={filter.label}
      value={text}
      onChange={(e) => {
        const value = e.target.value;
        setText(value);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          lastSent.current = value.trim();
          update({ [filter.key]: lastSent.current });
        }, 300);
      }}
    />
  );
}

export type ViewMode = "table" | "kanban";

/**
 * Filters, search text, view mode and page all live in the URL search parameters, so they
 * survive a refresh and work with Back. Needs a Suspense boundary above it (useSearchParams).
 */
export function useListParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const get = (key: string) => searchParams.get(key) ?? "";
  const page = Math.max(1, Number.parseInt(get("page"), 10) || 1);
  const view: ViewMode = get("view") === "kanban" ? "kanban" : "table";

  /** Empty or null removes a parameter. The page resets to 1 unless `page` is being set. */
  function update(changes: Record<string, string | null>) {
    // Read the live URL, not the render-time one, so a debounced update never undoes a newer one.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in changes)) next.delete("page");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return { get, page, view, update };
}

/**
 * After a delete or a status change the current page can end up past the last one (page 3 of
 * a list that now has 2). Moves to the last page that exists, replacing the URL entry so Back
 * is unaffected. Does nothing while a page is loading, for an empty first page (that is the
 * normal empty state), or when `enabled` is false (the Kanban board ignores `page`).
 */
export function usePageClamp(
  query: { data?: { items: unknown[]; total: number; page_size: number }; isPlaceholderData: boolean },
  page: number,
  update: (changes: Record<string, string | null>) => void,
  enabled = true,
) {
  const data = query.data;
  const emptyPastFirst = enabled && !query.isPlaceholderData && data !== undefined && data.items.length === 0 && page > 1;
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? 1;
  useEffect(() => {
    if (!emptyPastFirst) return;
    const last = Math.max(1, Math.ceil(total / pageSize));
    update({ page: last > 1 ? String(last) : null });
    // `update` is recreated every render and only reads the live URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emptyPastFirst, total, pageSize]);
}

type ListToolbarProps = {
  filters: ToolbarFilter[];
  searchPlaceholder?: string;
  /** Show the table / Kanban switch. */
  viewToggle?: boolean;
  /**
   * Allowed sort values for this entity (must match the API's sort allowlist). The first is the
   * default and is not written to the URL. Omit for no sort control.
   */
  sortOptions?: Option[];
};

export function ListToolbar({ filters, searchPlaceholder = "Search", viewToggle, sortOptions }: ListToolbarProps) {
  const { get, view, update } = useListParams();
  const urlQ = get("q");
  const [text, setText] = useState(urlQ);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The last search value this component wrote to the URL. Seeing it come back is not an outside change.
  const lastSent = useRef(urlQ);

  // Follow the URL when it changes from outside (Back, clear filters), unless the user is mid-typing.
  useEffect(() => {
    if (timer.current || urlQ === lastSent.current) return;
    lastSent.current = urlQ;
    setText(urlQ);
  }, [urlQ]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function onSearch(value: string) {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      lastSent.current = value.trim();
      update({ q: lastSent.current });
    }, 300);
  }

  const activeCount = filters.filter((f) => get(f.key)).length;
  const [open, setOpen] = useState(activeCount > 0);
  const anyActive = activeCount > 0 || urlQ !== "";

  function clearAll() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setText("");
    lastSent.current = "";
    update({ q: null, ...Object.fromEntries(filters.map((f) => [f.key, null])) });
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={text}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        {filters.length > 0 ? (
          <Button variant="outline" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <ListFilter data-icon="inline-start" />
            Filters{activeCount ? ` (${activeCount})` : ""}
          </Button>
        ) : null}
        {anyActive ? (
          <Button variant="ghost" onClick={clearAll}>
            <X data-icon="inline-start" />
            Clear
          </Button>
        ) : null}
        {sortOptions ? (
          <NativeSelect
            label="Sort by"
            hideLabel
            className="w-44"
            options={sortOptions}
            value={get("sort") || sortOptions[0].value}
            onChange={(e) => update({ sort: e.target.value === sortOptions[0].value ? null : e.target.value })}
          />
        ) : null}
        {viewToggle ? (
          <div className="ml-auto flex rounded-lg border p-0.5" role="group" aria-label="View">
            <Button variant={view === "table" ? "secondary" : "ghost"} size="sm" aria-pressed={view === "table"} onClick={() => update({ view: null })}>
              <Table2 data-icon="inline-start" />
              Table
            </Button>
            <Button variant={view === "kanban" ? "secondary" : "ghost"} size="sm" aria-pressed={view === "kanban"} onClick={() => update({ view: "kanban" })}>
              <Kanban data-icon="inline-start" />
              Kanban
            </Button>
          </div>
        ) : null}
      </div>
      {open && filters.length > 0 ? (
        <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-4">
          {filters.map((f) =>
            f.type === "select" ? (
              <NativeSelect
                key={f.key}
                label={f.label}
                options={f.options}
                placeholder="Any"
                value={get(f.key)}
                onChange={(e) => update({ [f.key]: e.target.value })}
              />
            ) : f.type === "text" ? (
              <TextFilter key={f.key} filter={f} />
            ) : (
              <TextField key={f.key} label={f.label} type="date" value={get(f.key)} onChange={(e) => update({ [f.key]: e.target.value })} />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
