import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  /** Buttons shown on the right (stacked below the title on narrow screens). */
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 sm:max-w-[65%] sm:justify-end">{actions}</div> : null}
    </header>
  );
}
