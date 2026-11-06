"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

type FormSectionProps = {
  icon: LucideIcon;
  title: string;
  /** One short line saying what is inside. */
  hint: string;
  /** Start open, for example when editing a record that has values here. */
  defaultOpen?: boolean;
  /** Any field inside has an error. */
  hasError?: boolean;
  /** The form's submit count. Every failed submit opens a section with an error, even one the user closed. */
  submitCount: number;
  /** Tailwind grid classes for the fields. */
  className?: string;
  children: ReactNode;
};

/**
 * Optional fields that stay out of the way until needed. The fields are always in the DOM, so
 * the form library keeps their values and every one stays reachable.
 */
export function FormSection({ icon: Icon, title, hint, defaultOpen = false, hasError = false, submitCount, className = "grid grid-cols-1 gap-4 sm:grid-cols-2", children }: FormSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDetailsElement>(null);

  // A new error (a server error arrives after the submit) or a new failed submit opens the section.
  // The user can still close it afterwards; only the next failure opens it again.
  const attempt = `${submitCount}:${hasError}`;
  const [seenAttempt, setSeenAttempt] = useState(attempt);
  if (attempt !== seenAttempt) {
    setSeenAttempt(attempt);
    if (hasError) setOpen(true);
  }

  // Move to the first bad field, unless focus is already on a bad field in an earlier section.
  useEffect(() => {
    if (!hasError) return;
    if (document.activeElement?.getAttribute("aria-invalid") === "true") return;
    ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [hasError, submitCount]);

  return (
    <details ref={ref} open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group/section border-t">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-lg py-2 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          <span className="block text-xs text-muted-foreground group-open/section:hidden">{hint}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/section:rotate-180" aria-hidden="true" />
      </summary>
      <fieldset className={`pt-2 pb-5 ${className}`}>
        <legend className="sr-only">{title}</legend>
        {children}
      </fieldset>
    </details>
  );
}
