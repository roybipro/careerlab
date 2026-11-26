"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useQueries } from "@tanstack/react-query";
import { Briefcase, Contact, CornerDownLeft, FlaskConical, FolderKanban, Loader2, Moon, Plus, Search, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { NAV_ITEMS } from "@/components/nav-items";
import { CREATE_ITEMS, useQuickCreate } from "@/components/quick-create";
import { api } from "@/lib/api";
import { statusLabel } from "@/lib/enums";
import type { Contact as ContactRecord, Job, Paginated, Project, Research } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";

type Command = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  /** Extra words the filter matches, beyond the label. */
  keywords?: string;
  run: () => void;
};

const RECORD_SOURCES = [
  { key: "jobs", path: "/jobs", group: "Job applications", icon: Briefcase },
  { key: "research", path: "/research", group: "Research opportunities", icon: FlaskConical },
  { key: "projects", path: "/projects", group: "Research projects", icon: FolderKanban },
  { key: "contacts", path: "/contacts", group: "Contacts", icon: Contact },
] as const;

type AnyRecord = Job | Research | Project | ContactRecord;

function describe(key: (typeof RECORD_SOURCES)[number]["key"], r: AnyRecord): { label: string; hint: string } {
  if (key === "jobs") {
    const j = r as Job;
    return { label: `${j.position_title} at ${j.company_name}`, hint: statusLabel(j.status) };
  }
  if (key === "research") {
    const x = r as Research;
    return { label: x.title, hint: [x.organization, statusLabel(x.status)].filter(Boolean).join(" · ") };
  }
  if (key === "projects") {
    const p = r as Project;
    return { label: p.title, hint: p.institution ?? "Research project" };
  }
  const c = r as ContactRecord;
  return { label: c.name, hint: [c.position, c.organization].filter(Boolean).join(", ") || "Contact" };
}

function matches(command: Command, needle: string): boolean {
  if (!needle) return true;
  const hay = `${command.label} ${command.keywords ?? ""}`.toLowerCase();
  return needle
    .toLowerCase()
    .split(/\s+/)
    .every((word) => hay.includes(word));
}

/**
 * Search, jump and create from anywhere: ⌘K / Ctrl+K, or "/" outside a text field.
 * Arrow keys move, Enter runs, Escape closes. Records are searched on the server once typing pauses.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const create = useQuickCreate();
  const { resolvedTheme, setTheme } = useTheme();
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const needle = useDebounced(text.trim(), 200);

  const records = useQueries({
    queries: RECORD_SOURCES.map((s) => ({
      queryKey: ["palette", s.key, needle],
      queryFn: () => api<Paginated<AnyRecord>>(s.path, { query: { q: needle, page_size: 4 } }),
      enabled: open && needle.length >= 2,
      staleTime: 30_000,
    })),
  });
  const searching = needle.length >= 2 && records.some((r) => r.isFetching);
  const recordsVersion = records.map((r) => r.dataUpdatedAt).join();

  const commands = useMemo(() => {
    const go = (href: string) => () => router.push(href);
    const fixed: Command[] = [
      ...CREATE_ITEMS.map((c) => ({
        id: `new-${c.kind}`,
        group: "Create",
        label: `New ${c.label.toLowerCase()}`,
        hint: c.hint,
        icon: c.icon,
        keywords: "add create new",
        run: () => create(c.kind),
      })),
      ...NAV_ITEMS.map((n) => ({ id: `go-${n.href}`, group: "Go to", label: n.label, icon: n.icon, keywords: "go open page", run: go(n.href) })),
      {
        id: "theme",
        group: "Preferences",
        label: resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        icon: resolvedTheme === "dark" ? Sun : Moon,
        keywords: "theme dark light appearance",
        run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
    ];
    const found: Command[] =
      needle.length >= 2
        ? RECORD_SOURCES.flatMap((s, i) =>
            (records[i].data?.items ?? []).map((r) => {
              const { label, hint } = describe(s.key, r);
              return { id: `${s.key}-${r.id}`, group: s.group, label, hint, icon: s.icon, run: go(`${s.path}/${r.id}`) };
            }),
          )
        : [];
    return [...found, ...fixed.filter((c) => matches(c, text.trim()))];
    // `records` is a new array each render; `recordsVersion` changes when its data does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, needle, resolvedTheme, recordsVersion]);

  // Keep the highlighted row valid and in view.
  const current = Math.min(active, Math.max(commands.length - 1, 0));
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setText("");
      setActive(0);
    }
  }

  function run(command: Command | undefined) {
    if (!command) return;
    close(false);
    command.run();
  }

  let lastGroup = "";
  return (
    <DialogPrimitive.Root open={open} onOpenChange={close}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed top-[12vh] left-1/2 z-50 flex max-h-[70vh] w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-lift outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[.98] data-closed:animate-out data-closed:fade-out-0">
          <DialogPrimitive.Title className="sr-only">Search and commands</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Type to find a record, a page or an action. Use the arrow keys to choose and Enter to open.</DialogPrimitive.Description>
          <div className="flex items-center gap-3 border-b px-4">
            {searching ? <Loader2 className="size-4.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" /> : <Search className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
            <input
              autoFocus
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={commands[current] ? `${listId}-${current}` : undefined}
              aria-label="Search records, pages and actions"
              placeholder="Search jobs, contacts, pages…"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive(Math.min(current + 1, commands.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive(Math.max(current - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  run(commands[current]);
                }
              }}
              className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 font-sans text-[0.6875rem] text-muted-foreground sm:block">Esc</kbd>
          </div>
          <div ref={listRef} id={listId} role="listbox" aria-label="Results" className="flex-1 overflow-y-auto p-2">
            {commands.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">{searching ? "Searching…" : `No results for “${text.trim()}”.`}</p>
            ) : (
              commands.map((c, i) => {
                const heading = c.group !== lastGroup ? c.group : null;
                lastGroup = c.group;
                const selected = i === current;
                return (
                  <div key={c.id} role="presentation">
                    {heading ? (
                      <p role="presentation" className="px-3 pt-3 pb-1.5 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
                        {heading}
                      </p>
                    ) : null}
                    <div
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={selected}
                      data-index={i}
                      onMouseMove={() => !selected && setActive(i)}
                      onClick={() => run(c)}
                      className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm", selected ? "bg-accent text-accent-foreground" : "text-foreground")}
                    >
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg border bg-card", selected && "border-transparent text-primary")}>
                        {c.group === "Create" ? <Plus className="size-4" aria-hidden="true" /> : <c.icon className="size-4" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.label}</span>
                        {c.hint ? <span className={cn("block truncate text-xs", selected ? "text-accent-foreground/80" : "text-muted-foreground")}>{c.hint}</span> : null}
                      </span>
                      {selected ? <CornerDownLeft className="size-4 shrink-0 opacity-70" aria-hidden="true" /> : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="hidden items-center gap-4 border-t bg-muted/50 px-4 py-2.5 text-xs text-muted-foreground sm:flex">
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-card px-1 font-sans">↑</kbd>
              <kbd className="rounded border bg-card px-1 font-sans">↓</kbd>
              <span className="ml-0.5">to move</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-card px-1 font-sans">Enter</kbd>
              <span className="ml-0.5">to open</span>
            </span>
            <span className="ml-auto">Type 2+ letters to search your records</span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Opens the palette on ⌘K / Ctrl+K anywhere, and on "/" when focus is not in a text field. */
export function useCommandPaletteShortcut(toggle: () => void, show: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
        return;
      }
      const el = e.target as HTMLElement | null;
      const typing = el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        show();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, show]);
}
