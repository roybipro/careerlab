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
  | { type: "date"; key: string; label: string };

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

type ListToolbarProps = {
  filters: ToolbarFilter[];
  searchPlaceholder?: string;
  /** Show the table / Kanban switch. */
  viewToggle?: boolean;
};

export function ListToolbar({ filters, searchPlaceholder = "Search", viewToggle }: ListToolbarProps) {
  const { get, view, update } = useListParams();
  const urlQ = get("q");
  const [text, setText] = useState(urlQ);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow the URL when it changes from outside (Back, clear filters), unless the user is mid-typing.
  useEffect(() => {
    if (!timer.current) setText(urlQ);
  }, [urlQ]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function onSearch(value: string) {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      update({ q: value.trim() });
    }, 300);
  }

  const activeCount = filters.filter((f) => get(f.key)).length;
  const [open, setOpen] = useState(activeCount > 0);
  const anyActive = activeCount > 0 || urlQ !== "";

  function clearAll() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setText("");
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
            ) : (
              <TextField key={f.key} label={f.label} type="date" value={get(f.key)} onChange={(e) => update({ [f.key]: e.target.value })} />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
