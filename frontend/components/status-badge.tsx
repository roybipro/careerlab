import { Badge } from "@/components/ui/badge";
import { PRIORITIES, PRIORITY_BADGE, PRIORITY_ICON, statusLabel, statusMeta } from "@/lib/enums";
import { cn } from "@/lib/utils";

/** Works for job and research statuses alike. The label and icon carry the meaning, not the colour alone. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = statusMeta(status);
  const Icon = meta.icon;
  return (
    <Badge variant="secondary" className={cn("border-transparent", meta.badge, className)}>
      <Icon aria-hidden="true" />
      {statusLabel(status)}
    </Badge>
  );
}

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  const label = PRIORITIES.find((p) => p.value === priority)?.label ?? priority;
  const Icon = PRIORITY_ICON[priority];
  return (
    <Badge variant="secondary" className={cn("border-transparent", PRIORITY_BADGE[priority], className)}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {label}
    </Badge>
  );
}
