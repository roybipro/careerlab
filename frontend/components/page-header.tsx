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
  /** Extra classes for the actions wrapper, for a page with more buttons than the default width fits. */
  actionsClassName?: string;
};

export function PageHeader({ title, description, icon: Icon, actions, actionsClassName }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon ? (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Icon className="size-5" aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words md:text-[1.75rem] md:leading-tight">{title}</h1>
          {description ? <p className="mt-1 text-sm break-words text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className={cn("flex shrink-0 flex-wrap gap-2 lg:max-w-[60%] lg:justify-end", actionsClassName)}>{actions}</div> : null}
    </header>
  );
}
