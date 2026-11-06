import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { safeHttpUrl } from "@/lib/format";

/** A label and value in a details grid. Renders nothing when there is no value. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

/** A stored URL is a link only when it starts with http; anything else is shown as plain text. */
export function UrlValue({ value }: { value: string | null }) {
  if (!value) return null;
  const href = safeHttpUrl(value);
  if (!href) return <>{value}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
      {href}
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  );
}

/** A long free-text field under its own heading. Renders nothing when empty. */
export function TextSection({ title, value }: { title: string; value: string | null }) {
  if (!value) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs text-muted-foreground">{title}</h3>
      <p className="text-sm break-words whitespace-pre-wrap">{value}</p>
    </section>
  );
}
