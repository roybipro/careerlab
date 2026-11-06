import type { LucideIcon } from "lucide-react";
import { useId, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type TextFieldProps = Omit<ComponentProps<typeof Input>, "id"> & {
  label: string;
  error?: string;
  hint?: string;
  /** Optional decorative icon inside the control. */
  icon?: LucideIcon;
};

/** Label + input + hint + error, wired together for screen readers. Works with `register()`. */
export function TextField({ label, error, hint, icon: Icon, className, ...inputProps }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {Icon ? (
        <div className="relative">
          <Icon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={cn("pl-8", className)} {...inputProps} />
        </div>
      ) : (
        <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={className} {...inputProps} />
      )}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
