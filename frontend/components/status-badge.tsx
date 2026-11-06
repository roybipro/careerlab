import { Badge } from "@/components/ui/badge";
import { PRIORITIES, PRIORITY_BADGE, STATUS_META, statusLabel } from "@/lib/enums";
import { cn } from "@/lib/utils";

/** Works for job and research statuses alike. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent", STATUS_META[status]?.badge, className)}>
      {statusLabel(status)}
    </Badge>
  );
}

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  const label = PRIORITIES.find((p) => p.value === priority)?.label ?? priority;
  return (
    <Badge variant="secondary" className={cn("border-transparent", PRIORITY_BADGE[priority], className)}>
      {label}
    </Badge>
  );
}
