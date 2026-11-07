"use client";

import { segmentClass, useListParams } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import type { Option } from "@/lib/enums";

/** The URL value if it is one of the options, or "" (the first option, All) for anything else. */
export function readSwitch(options: Option[], value: string): string {
  return options.some((o) => o.value === value) ? value : "";
}

/**
 * A segmented switch above a list (jobs: All / Jobs / Internships, projects: All / Active). The choice is
 * kept in the URL under `param`; the option with value "" is the default and leaves the URL clean.
 * Changing it goes back to page 1.
 */
export function ListSwitch({ param, label, options }: { param: string; label: string; options: Option[] }) {
  const { get, update } = useListParams();
  const current = readSwitch(options, get(param));
  return (
    <div className="mb-3 flex w-full gap-0.5 rounded-xl bg-muted p-1 sm:w-fit" role="group" aria-label={label}>
      {options.map((o) => (
        <Button
          key={o.value}
          variant="ghost"
          size="sm"
          className={`flex-1 sm:flex-none ${segmentClass(current === o.value)}`}
          aria-pressed={current === o.value}
          onClick={() => update({ [param]: o.value || null })}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
