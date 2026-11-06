import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  /** Optional icon beside the title. */
  icon?: LucideIcon;
  /** Buttons shown on the right (stacked below the title on narrow screens). */
  actions?: ReactNode;
};

export function PageHeader({ title, description, icon: Icon, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
      {actions ? <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-[60%] sm:justify-end">{actions}</div> : null}
    </header>
  );
}
