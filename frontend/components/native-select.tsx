import { ChevronDown, type LucideIcon } from "lucide-react";
import { useId, type ComponentProps } from "react";
import type { Option } from "@/lib/enums";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type NativeSelectProps = Omit<ComponentProps<"select">, "id"> & {
  /** Optional decorative icon inside the control. */
  icon?: LucideIcon;
  label: string;
  options: Option[];
  /** Text of the empty choice. Omit it for a required field. */
  placeholder?: string;
  error?: string;
  /** Hide the label visually (it stays for screen readers). */
  hideLabel?: boolean;
};

/**
 * A styled native <select>: keyboard and touch work out of the box, and it works with
 * `register()` and with controlled `value`/`onChange` alike.
 */
export function NativeSelect({ icon: Icon, label, options, placeholder, error, hideLabel, className, ...props }: NativeSelectProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </Label>
      <div className="relative">
        {Icon ? <Icon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /> : null}
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          className={cn(
            "h-10 w-full appearance-none rounded-lg border border-input bg-field pr-8 pl-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:h-9 [&>option]:bg-popover [&>option]:text-popover-foreground",
            Icon && "pl-8",
            className,
          )}
          {...props}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
