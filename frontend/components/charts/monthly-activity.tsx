"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/data-state";
import type { MonthlyCount } from "@/lib/types";

const monthFormat = new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });

/** "2026-11" -> "Nov 26". Built in UTC from the parts so the month never shifts with the viewer's zone. */
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return monthFormat.format(new Date(Date.UTC(y, m - 1, 1)));
}

const SERIES = [
  { key: "jobs", label: "Job applications", color: "var(--viz-1)" },
  { key: "research", label: "Research opportunities", color: "var(--viz-2)" },
] as const;

/**
 * Applications per month over the last 12 months, by application date. Two series, so a legend
 * names them. The chart is hidden from screen readers, which get the numbers as a table.
 */
export function MonthlyActivity({ data }: { data: MonthlyCount[] }) {
  const rows = data.map((d) => ({ ...d, label: monthLabel(d.month) }));
  const total = rows.reduce((sum, r) => sum + r.jobs + r.research, 0);
  if (total === 0) {
    return (
      <EmptyState
        title="No applications in the last 12 months"
        description="Set an application date on a job or research opportunity and it is counted here."
      />
    );
  }

  return (
    <figure aria-label="Monthly activity" className="m-0">
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-xs" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} stroke="var(--border)" tickLine={false} interval="preserveStartEnd" minTickGap={12} />
            <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
                    <p className="mb-1 font-medium">{label}</p>
                    {SERIES.map((s) => (
                      <p key={s.key} className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                        {s.label}: <span className="font-semibold">{payload[0].payload[s.key]}</span>
                      </p>
                    ))}
                  </div>
                ) : null
              }
            />
            {SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} barSize={10} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Applications per month, last 12 months</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Job applications</th>
            <th scope="col">Research opportunities</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month}>
              <th scope="row">{r.label}</th>
              <td>{r.jobs}</td>
              <td>{r.research}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
