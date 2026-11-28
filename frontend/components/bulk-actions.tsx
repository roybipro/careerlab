"use client";

import { ChevronDown, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Option } from "@/lib/enums";
import { count, type Noun } from "@/lib/use-bulk-actions";

/**
 * Which rows of the current page are ticked. The selection belongs to one set of rows: when
 * the page, filters or sort change (or rows are deleted), it starts empty again, so an action
 * never reaches a row that is no longer on screen.
 */
export function useSelection(ids: string[]) {
  const pageKey = ids.join(",");
  const [state, setState] = useState<{ pageKey: string; picked: Set<string> }>({ pageKey, picked: new Set() });
  const picked = state.pageKey === pageKey ? state.picked : new Set<string>();
  const selected = ids.filter((id) => picked.has(id));

  function set(next: Set<string>) {
    setState({ pageKey, picked: next });
  }

  return {
    selected,
    isSelected: (id: string) => picked.has(id),
    toggle: (id: string) => {
      const next = new Set(picked);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      set(next);
    },
    allSelected: ids.length > 0 && selected.length === ids.length,
    someSelected: selected.length > 0 && selected.length < ids.length,
    toggleAll: () => set(selected.length === ids.length ? new Set() : new Set(ids)),
    clear: () => set(new Set()),
  };
}

export type Selection = ReturnType<typeof useSelection>;

const BOX = "size-4 cursor-pointer rounded-sm accent-primary align-middle";

/** The header checkbox: ticks every row on the page, or clears them; shows a dash when only some are ticked. */
export function SelectAllCheckbox({ selection, label }: { selection: Selection; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selection.someSelected;
  }, [selection.someSelected]);
  return <input ref={ref} type="checkbox" className={BOX} aria-label={label} checked={selection.allSelected} onChange={selection.toggleAll} />;
}

export function RowCheckbox({ selection, id, label }: { selection: Selection; id: string; label: string }) {
  return <input type="checkbox" data-row-select className={BOX} aria-label={label} checked={selection.isSelected(id)} onChange={() => selection.toggle(id)} />;
}

/** A menu in the bulk bar that sets one field (status, priority, stage) on every ticked row. */
export function BulkPicker({
  label,
  options,
  renderValue,
  onPick,
  disabled,
}: {
  label: string;
  options: Option[];
  renderValue: (value: string) => ReactNode;
  onPick: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="gap-1" disabled={disabled} />}>
        {label}
        <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" side="top" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Set {label.toLowerCase()}</DropdownMenuLabel>
          {options.map((o) => (
            <DropdownMenuItem key={o.value} onClick={() => onPick(o.value)}>
              {renderValue(o.value)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Floats at the bottom of the screen while rows are ticked: the count, the pickers passed as
 * children, Delete (with a confirmation) and a button to clear the selection. Escape clears too.
 */
export function BulkBar({
  selection,
  noun,
  onDelete,
  pending,
  children,
}: {
  selection: Selection;
  noun: Noun;
  /** Resolves once the delete has finished, successfully or not. */
  onDelete: (ids: string[]) => Promise<unknown>;
  pending: boolean;
  children?: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const n = selection.selected.length;
  const { clear } = selection;

  useEffect(() => {
    if (n === 0 || confirming) return;
    function onKey(e: KeyboardEvent) {
      // Leave Escape to an open menu or dialog first.
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[role=menu],[role=alertdialog]")) clear();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [n, confirming, clear]);

  return (
    <>
      {/* Announced to screen readers as the count changes, even while the bar is hidden. */}
      <p className="sr-only" aria-live="polite">
        {n ? `${count(n, noun)} selected` : ""}
      </p>
      {n ? (
        <div
          role="toolbar"
          aria-label={`Actions for ${count(n, noun)}`}
          className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-1 rounded-full border bg-popover py-1.5 pr-1.5 pl-4 text-popover-foreground shadow-lg"
        >
          <span className="mr-2 text-sm font-medium tabular-nums">{n} selected</span>
          {children}
          <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setConfirming(true)} disabled={pending}>
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete
          </Button>
          <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Clear selection" onClick={clear}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${count(n, noun)}?`}
        description="Their notes, reminders and contact links are deleted too. This cannot be undone."
        confirmLabel={`Delete ${count(n, noun)}`}
        pending={pending}
        onConfirm={() => {
          void onDelete(selection.selected).finally(() => setConfirming(false));
        }}
      />
    </>
  );
}
