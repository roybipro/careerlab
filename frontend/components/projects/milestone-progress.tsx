import { cn } from "@/lib/utils";

/**
 * "2 of 5 milestones done" as a bar with the same words beside it, so the figure never depends on the
 * bar. A project with no milestones has no progress to show, so this renders nothing for it.
 */
export function MilestoneProgress({ done, total, className }: { done: number; total: number; className?: string }) {
  if (total <= 0) return null;
  const text = `${done} of ${total} done`;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-label="Milestones"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${total} milestones done`}
        className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (done / total) * 100)}%` }} />
      </div>
      <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums" aria-hidden="true">
        {text}
      </span>
    </div>
  );
}
