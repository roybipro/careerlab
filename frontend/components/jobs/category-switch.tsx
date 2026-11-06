"use client";

import { segmentClass, useListParams } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { JOB_CATEGORIES } from "@/lib/enums";

/** The `category` URL value, or "" (All) for anything else. */
export function readCategory(value: string): string {
  return JOB_CATEGORIES.some((c) => c.value === value) ? value : "";
}

/** All / Jobs / Internships. Kept in the URL as `category`; changing it goes back to page 1. */
export function CategorySwitch() {
  const { get, update } = useListParams();
  const current = readCategory(get("category"));
  return (
    <div className="mb-3 flex w-full gap-0.5 rounded-xl bg-muted p-1 sm:w-fit" role="group" aria-label="Category">
      {JOB_CATEGORIES.map((c) => (
        <Button
          key={c.value}
          variant="ghost"
          size="sm"
          className={`flex-1 sm:flex-none ${segmentClass(current === c.value)}`}
          aria-pressed={current === c.value}
          onClick={() => update({ category: c.value || null })}
        >
          {c.label}
        </Button>
      ))}
    </div>
  );
}
