import { Badge } from "@/components/ui/badge";
import { CONTACT_TYPE_ICON, CONTACT_TYPES, optionLabel } from "@/lib/enums";

export function ContactTypeBadge({ type }: { type: string }) {
  const Icon = CONTACT_TYPE_ICON[type];
  return (
    <Badge variant="secondary">
      {Icon ? <Icon aria-hidden="true" /> : null}
      {optionLabel(CONTACT_TYPES, type)}
    </Badge>
  );
}
