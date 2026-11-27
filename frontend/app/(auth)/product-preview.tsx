import { Check } from "lucide-react";
import { STATUS_META } from "@/lib/enums";
import { cn } from "@/lib/utils";

const POINTS = ["Jobs and research in one place", "Never miss a deadline or follow-up", "See every stage at a glance"];

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
    <aside className="relative hidden flex-col justify-center gap-8 overflow-hidden bg-linear-to-br from-wash to-wash-violet px-12 py-12 lg:flex xl:px-20">
      {/* Decorative blooms of the brand green and violet. */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-title-via/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-20 size-96 rounded-full bg-brand-from/15 blur-3xl" />
      <div className="relative max-w-md">
        <h2 className="text-5xl leading-[1.1] font-medium tracking-tight text-balance">
          <span className="text-title-gradient box-decoration-clone">Every application, one clear pipeline.</span>
        </h2>
        <p className="mt-4 text-lg text-foreground/85">See what is next, what is due and where each opportunity stands.</p>
        <ul className="mt-6 space-y-3 text-base">
          {POINTS.map((point) => (
            <li key={point} className="flex items-center gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-highlight text-highlight-foreground">
                <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
              </span>
              {point}
            </li>
          ))}
        </ul>
      </div>
      <div
        role="img"
        aria-label="Preview of CareerLab with invented sample data: a pipeline bar and three applications."
        className="relative w-full max-w-md rounded-2xl bg-card p-5 text-card-foreground shadow-lift ring-1 ring-border"
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
      <p className="relative text-xs text-muted-foreground">Sample data. Every name here is invented.</p>
    </aside>
  );
}
