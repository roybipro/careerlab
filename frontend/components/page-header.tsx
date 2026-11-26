import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  /** Optional icon beside the title. */
  icon?: LucideIcon;
  /** Buttons shown on the right (stacked below the title on narrow screens). */
  actions?: ReactNode;
  /** A page with many buttons: stack the actions under the title until `xl`, so the title is never squeezed. */
  wideActions?: boolean;
  /** A short line above the title, such as today's date. */
  eyebrow?: ReactNode;
};

export function PageHeader({ title, description, icon: Icon, actions, wideActions, eyebrow }: PageHeaderProps) {
  return (
    <header className={cn("mb-8 flex flex-col gap-5", wideActions ? "xl:flex-row xl:items-end xl:justify-between" : "lg:flex-row lg:items-end lg:justify-between")}>
      <div className="flex min-w-0 items-center gap-4">
        {Icon ? (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-card text-primary shadow-card">
            <Icon className="size-5.5" aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <p className="mb-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</p> : null}
          <h1 className="text-2xl font-semibold tracking-tight break-words md:text-3xl md:leading-tight">{title}</h1>
          {description ? <p className="mt-1 text-sm break-words text-muted-foreground md:text-[0.9375rem]">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className={cn("flex shrink-0 flex-wrap gap-2", wideActions ? "xl:max-w-[70%] xl:justify-end" : "lg:max-w-[60%] lg:justify-end")}>{actions}</div> : null}
    </header>
  );
}
