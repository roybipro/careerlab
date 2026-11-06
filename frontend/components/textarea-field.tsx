import { useId, type ComponentProps } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TextAreaFieldProps = Omit<ComponentProps<typeof Textarea>, "id"> & { label: string; error?: string };

/** Label + textarea + error, like TextField. Works with `register()`. */
export function TextAreaField({ label, error, ...props }: TextAreaFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} {...props} />
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
