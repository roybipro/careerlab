import { STATUS_META } from "@/lib/enums";
import { cn } from "@/lib/utils";

/** Invented sample data: no real company, university or person. */
const PIPELINE = [
  { status: "applied", count: 5 },
  { status: "interview", count: 2 },
  { status: "offer", count: 1 },
] as const;

const ROWS = [
  { name: "Thistlewick Robotics", role: "Controls Engineer", status: "interview" },
  { name: "Quillfern Data", role: "Analytics Engineer", status: "applied" },
  { name: "Imaginary Institute of Science", role: "Research Fellowship", status: "offer" },
] as const;

/** A picture of the product made of real markup. One element for screen readers, shown only on large screens. */
export function ProductPreview() {
  const total = PIPELINE.reduce((sum, p) => sum + p.count, 0);
  return (
    <aside className="hidden flex-col justify-center gap-8 bg-sidebar px-12 py-12 lg:flex xl:px-20">
      <div className="max-w-md">
        <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance text-white">Every application, one clear pipeline.</h2>
        <p className="mt-3 text-sm text-sidebar-foreground">See what is next, what is due and where each opportunity stands.</p>
      </div>
      <div
        role="img"
        aria-label="Preview of CareerLab with invented sample data: a pipeline bar and three applications."
        className="w-full max-w-md rounded-2xl bg-card p-5 text-card-foreground shadow-lift"
      >
        <p className="text-sm font-semibold tracking-tight">Job pipeline</p>
        <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {PIPELINE.map((p) => (
            <span key={p.status} className={STATUS_META[p.status].dot} style={{ width: `${(p.count / total) * 100}%` }} />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {PIPELINE.map((p) => (
            <li key={p.status} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", STATUS_META[p.status].dot)} />
              {STATUS_META[p.status].label}
              <span className="font-semibold text-foreground tabular-nums">{p.count}</span>
            </li>
          ))}
        </ul>
        <ul className="mt-4 divide-y border-t">
          {ROWS.map((row) => {
            const meta = STATUS_META[row.status];
            const Icon = meta.icon;
            return (
              <li key={row.name} className="flex items-center gap-3 py-3 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.role}</p>
                </div>
                <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium", meta.badge)}>
                  <Icon className="size-3" />
                  {meta.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-xs text-sidebar-foreground">Sample data. Every name here is invented.</p>
    </aside>
  );
}
