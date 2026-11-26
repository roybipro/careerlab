"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Option } from "@/lib/enums";
import { formatDateOnly } from "@/lib/format";

/**
 * A badge you click to change: opens a menu of options and saves the one picked.
 * `label` names the field and row for screen readers, for example "Status for Acme".
 */
export function InlineSelect({
  value,
  options,
  label,
  onChange,
  renderValue,
}: {
  value: string;
  options: Option[];
  label: string;
  onChange: (value: string) => void;
  /** The badge shown in the cell and in the menu. */
  renderValue: (value: string) => ReactNode;
}) {
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${label}: ${current}. Change`}
        className="group/inline -mx-1 inline-flex items-center gap-1 rounded-full p-1 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted"
      >
        {renderValue(value)}
        <ChevronDown className="size-3.5 text-muted-foreground opacity-40 transition-opacity group-hover/inline:opacity-100 group-focus-visible/inline:opacity-100 group-aria-expanded/inline:opacity-100" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          {options.map((o) => (
            <DropdownMenuItem key={o.value} onClick={() => o.value !== value && onChange(o.value)} className="justify-between">
              {renderValue(o.value)}
              {o.value === value ? <Check className="size-4 text-primary" aria-label="Current" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A date you click to change. Shows the formatted date (or "Add date"); clicking opens a date
 * field with the browser's picker. The new date saves when the field loses focus or on Enter;
 * Escape cancels; the clear button removes the date.
 */
export function InlineDate({ value, label, onChange }: { value: string | null; label: string; onChange: (value: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  const shown = formatDateOnly(value);

  function commit(next: string) {
    setEditing(false);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const normalized = next || null;
    if (normalized !== (value ?? null)) onChange(normalized);
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="date"
          autoFocus
          aria-label={label}
          defaultValue={value ?? ""}
          onFocus={(e) => {
            // Open the calendar straight away where the browser allows it.
            try {
              e.currentTarget.showPicker?.();
            } catch {
              /* Not allowed or not supported: the field still works by typing. */
            }
          }}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              cancelled.current = true;
              e.currentTarget.blur();
            }
          }}
          className="h-8 rounded-md border border-input bg-field px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {value ? (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            // Runs before the field's blur, so clearing wins over saving the typed value.
            onMouseDown={(e) => {
              e.preventDefault();
              cancelled.current = true;
              setEditing(false);
              onChange(null);
            }}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={`${label}: ${shown ?? "not set"}. Change`}
      className="group/date -mx-2 inline-flex h-8 items-center rounded-md px-2 text-sm whitespace-nowrap text-muted-foreground tabular-nums outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {shown ?? (
        <>
          {/* Empty: a quiet dash, with the action spelled out on hover or keyboard focus. */}
          <span className="group-hover/date:hidden group-focus-visible/date:hidden" aria-hidden="true">
            -
          </span>
          <span className="hidden group-hover/date:inline group-focus-visible/date:inline">Add date</span>
        </>
      )}
    </button>
  );
}
