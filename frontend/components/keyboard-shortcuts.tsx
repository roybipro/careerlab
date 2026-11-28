"use client";

import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { useQuickCreate, type CreateKind } from "@/components/quick-create";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/*
 * Keyboard shortcuts for the signed-in app, on top of ⌘K and "/" (the command palette).
 *
 * Tables opt in by marking each row `data-row` (focusable with tabIndex -1), its main link
 * `data-row-open` and its bulk checkbox `data-row-select`. Shortcuts never fire while typing
 * in a field, with Ctrl, ⌘ or Alt held, or while a dialog or menu is open.
 */

const GO: Record<string, { href: string; label: string }> = {
  d: { href: "/dashboard", label: "Dashboard" },
  j: { href: "/jobs", label: "Job applications" },
  r: { href: "/research", label: "Research opportunities" },
  p: { href: "/projects", label: "Research projects" },
  c: { href: "/contacts", label: "Contacts" },
  m: { href: "/reminders", label: "Reminders" },
  a: { href: "/analytics", label: "Analytics" },
  s: { href: "/settings", label: "Settings" },
};

/** What "c" creates on each page: the thing the page lists, or a job elsewhere. */
function createKindFor(pathname: string): CreateKind {
  if (pathname.startsWith("/research")) return "research";
  if (pathname.startsWith("/projects")) return "project";
  if (pathname.startsWith("/contacts")) return "contact";
  if (pathname.startsWith("/reminders")) return "reminder";
  return "job";
}

const GROUPS: { title: string; keys: [string[], string][] }[] = [
  {
    title: "Anywhere",
    keys: [
      [["⌘", "K"], "Search and commands (Ctrl+K on Windows and Linux)"],
      [["/"], "Search and commands"],
      [["c"], "Create: a job, or what the current page lists"],
      [["?"], "Show these shortcuts"],
    ],
  },
  {
    title: "Go to",
    keys: Object.entries(GO).map(([key, { label }]) => [["g", key], label] as [string[], string]),
  },
  {
    title: "Lists",
    keys: [
      [["f"], "Focus the search box"],
      [["j"], "Next row"],
      [["k"], "Previous row"],
      [["Enter"], "Open the row (or o)"],
      [["x"], "Tick the row for bulk actions"],
      [["Esc"], "Clear the ticked rows"],
    ],
  },
];

// Inputs that take keystrokes as text. A focused checkbox or button still lets shortcuts through.
const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"]);

function isTyping(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type);
  return el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

function overlayOpen(): boolean {
  return document.querySelector("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]") !== null;
}

function visibleRows(): HTMLElement[] {
  // Tables and their phone card lists both exist in the page; only the one on screen counts.
  return Array.from(document.querySelectorAll<HTMLElement>("[data-row]")).filter((row) => row.offsetParent !== null);
}

function currentRow(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement ? active.closest<HTMLElement>("[data-row]") : null;
}

function moveRow(step: 1 | -1) {
  const rows = visibleRows();
  if (rows.length === 0) return;
  const current = currentRow();
  const index = current ? rows.indexOf(current) : -1;
  const next = index === -1 ? (step === 1 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, index + step));
  rows[next].focus();
  rows[next].scrollIntoView({ block: "nearest" });
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const create = useQuickCreate();
  const [helpOpen, setHelpOpen] = useState(false);
  // After "g", the next key picks a page; the wait ends after a second.
  const goPending = useRef<number | null>(null);

  useEffect(() => {
    function clearGo() {
      if (goPending.current !== null) window.clearTimeout(goPending.current);
      goPending.current = null;
    }

    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (isTyping(e.target as Element) || overlayOpen()) return;
      const key = e.key;

      if (goPending.current !== null) {
        clearGo();
        const target = GO[key.toLowerCase()];
        if (target) {
          e.preventDefault();
          router.push(target.href);
        }
        return;
      }

      switch (key) {
        case "?":
          e.preventDefault();
          setHelpOpen(true);
          return;
        case "g":
          goPending.current = window.setTimeout(clearGo, 1000);
          return;
        case "c":
          e.preventDefault();
          create(createKindFor(pathname));
          return;
        case "f": {
          const search = document.querySelector<HTMLInputElement>("[data-list-search]");
          if (search && search.offsetParent !== null) {
            e.preventDefault();
            search.focus();
            search.select();
          }
          return;
        }
        case "j":
        case "k":
          if (visibleRows().length === 0) return;
          e.preventDefault();
          moveRow(key === "j" ? 1 : -1);
          return;
        case "Enter":
        case "o": {
          const row = currentRow();
          // Enter on a link or button inside the row keeps its own meaning.
          if (!row || (key === "Enter" && document.activeElement !== row)) return;
          const link = row.querySelector<HTMLElement>("[data-row-open]");
          if (link) {
            e.preventDefault();
            link.click();
          }
          return;
        }
        case "x": {
          const box = currentRow()?.querySelector<HTMLInputElement>("[data-row-select]");
          if (box) {
            e.preventDefault();
            box.click();
          }
          return;
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearGo();
    };
  }, [router, pathname, create]);

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>They work when you are not typing in a field.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.title}</h3>
              <dl className="space-y-1.5">
                {group.keys.map(([keys, label]) => (
                  <div key={label} className="flex items-center justify-between gap-4 text-sm">
                    <dt>{label}</dt>
                    <dd className="flex shrink-0 items-center gap-1">
                      {keys.map((k, i) => (
                        <Fragment key={k}>
                          {i > 0 ? <span className="text-xs text-muted-foreground">{keys[0] === "g" ? "then" : "+"}</span> : null}
                          <kbd className="min-w-6 rounded border bg-muted px-1.5 py-0.5 text-center font-sans text-xs">{k}</kbd>
                        </Fragment>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
