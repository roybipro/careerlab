"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/data-state";
import { statusLabel } from "@/lib/enums";
import type { StatusCount } from "@/lib/types";

const ROW_HEIGHT = 32;

/**
 * How many records sit in each status, as horizontal bars in pipeline order, in one hue
 * (the statuses are one measure, so one colour). The chart is hidden from screen readers, which
 * get the same numbers as a table instead.
 */
export function StatusDistribution({ title, data, emptyHint }: { title: string; data: StatusCount[]; emptyHint: string }) {
  const rows = data.map((d) => ({ ...d, label: statusLabel(d.status) }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) return <EmptyState title={`No ${title.toLowerCase()} yet`} description={emptyHint} />;

  return (
    <figure aria-label={title} className="m-0">
      <div aria-hidden="true" style={{ height: rows.length * ROW_HEIGHT + 24 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 32, bottom: 0, left: 0 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} stroke="var(--border)" tickLine={false} />
            <YAxis type="category" dataKey="label" width={130} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-sm">
                    {payload[0].payload.label}: <span className="font-semibold">{payload[0].value}</span>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="count" fill="var(--viz-1)" barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList dataKey="count" position="right" fill="var(--foreground)" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Status</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.status}>
              <th scope="row">{r.label}</th>
              <td>{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
