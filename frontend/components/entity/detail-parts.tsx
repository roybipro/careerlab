import { ExternalLink, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { safeHttpUrl } from "@/lib/format";

/** A label and value in a details grid. Renders nothing when there is no value. */
export function Field({ label, icon: Icon, children }: { label: string; icon?: LucideIcon; children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

/** A stored URL is a link only when it starts with http; anything else is shown as plain text. */
export function UrlValue({ value }: { value: string | null }) {
  if (!value) return null;
  const href = safeHttpUrl(value);
  if (!href) return <>{value}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="break-words text-link underline-offset-4 hover:underline [overflow-wrap:anywhere]">
      {href}
      <ExternalLink className="ml-1 inline size-3 align-baseline" aria-hidden="true" />
    </a>
  );
}

/** A long free-text field under its own heading. Renders nothing when empty. */
export function TextSection({ title, value }: { title: string; value: string | null }) {
  if (!value) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium text-muted-foreground">{title}</h3>
      <p className="text-sm break-words whitespace-pre-wrap">{value}</p>
    </section>
  );
}
