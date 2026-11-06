import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OPPORTUNITY_TYPES, optionLabel } from "@/lib/enums";
import { formatDateOnly } from "@/lib/format";
import type { Research } from "@/lib/types";

function ResearchMeta({ item }: { item: Research }) {
  const deadline = formatDateOnly(item.deadline);
  return deadline ? <span className="text-xs text-muted-foreground">Deadline {deadline}</span> : null;
}

/** A table from `md` up, a stack of cards below it. */
export function ResearchTable({ items }: { items: Research[] }) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Deadline</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium whitespace-normal">
                  <Link href={`/research/${item.id}`} className="underline-offset-4 hover:underline">
                    {item.title}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-normal">{item.organization}</TableCell>
                <TableCell>{optionLabel(OPPORTUNITY_TYPES, item.opportunity_type) ?? "-"}</TableCell>
                <TableCell>{item.country ?? "-"}</TableCell>
                <TableCell>
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell>{formatDateOnly(item.deadline) ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="space-y-3 md:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/research/${item.id}`} className="block rounded-xl border p-3 hover:bg-muted/50">
              <p className="font-medium break-words">{item.title}</p>
              <p className="text-sm break-words text-muted-foreground">{item.organization}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={item.status} />
                <ResearchMeta item={item} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The card shown on the Kanban board. Leaves room on the right for the board's status menu. */
export function ResearchKanbanCard({ item }: { item: Research }) {
  return (
    <Link
      href={`/research/${item.id}`}
      draggable={false}
      className="block cursor-grab rounded-lg border bg-card p-3 pr-10 text-card-foreground select-none hover:border-ring/50"
    >
      <p className="text-sm font-medium break-words">{item.title}</p>
      <p className="text-xs break-words text-muted-foreground">{item.organization}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ResearchMeta item={item} />
      </div>
    </Link>
  );
}
