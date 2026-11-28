"use client";

import Link from "next/link";
import { BulkBar, BulkPicker, RowCheckbox, SelectAllCheckbox, useSelection } from "@/components/bulk-actions";
import { InlineDate, InlineSelect } from "@/components/inline-edit";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OPPORTUNITY_TYPES, RESEARCH_STATUSES, optionLabel } from "@/lib/enums";
import { formatDateOnly } from "@/lib/format";
import type { Research } from "@/lib/types";
import { useBulkActions } from "@/lib/use-bulk-actions";
import { useInlineUpdate } from "@/lib/use-inline-update";

function ResearchMeta({ item }: { item: Research }) {
  const deadline = formatDateOnly(item.deadline);
  return deadline ? <span className="text-xs text-muted-foreground">Deadline {deadline}</span> : null;
}

/** A table from `md` up, a stack of cards below it. */
export function ResearchTable({ items }: { items: Research[] }) {
  const update = useInlineUpdate<Research>("research", "/research", (item) => item.title);
  const save = (item: Research, field: string, value: string | null) => update.mutate({ item, changes: { [field]: value } });
  const bulk = useBulkActions("research", "/research", { one: "opportunity", many: "opportunities" });
  const selection = useSelection(items.map((row) => row.id));
  const bulkSet = (field: string) => (value: string) =>
    bulk.update.mutate({ ids: selection.selected, changes: { [field]: value } }, { onSuccess: selection.clear });
  return (
    <>
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pr-0">
                <SelectAllCheckbox selection={selection} label="Select all opportunities on this page" />
              </TableHead>
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
              <TableRow key={item.id} data-state={selection.isSelected(item.id) ? "selected" : undefined}>
                <TableCell className="w-10 pr-0">
                  <RowCheckbox selection={selection} id={item.id} label={`Select ${item.title}`} />
                </TableCell>
                <TableCell className="font-medium whitespace-normal">
                  <Link href={`/research/${item.id}`} className="underline-offset-4 hover:text-link hover:underline">
                    {item.title}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">{item.organization}</TableCell>
                <TableCell className="text-muted-foreground">{optionLabel(OPPORTUNITY_TYPES, item.opportunity_type) ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{item.country ?? "-"}</TableCell>
                <TableCell>
                  <InlineSelect
                    label={`Status for ${item.title}`}
                    value={item.status}
                    options={RESEARCH_STATUSES}
                    onChange={(v) => save(item, "status", v)}
                    renderValue={(v) => <StatusBadge status={v} />}
                  />
                </TableCell>
                <TableCell>
                  <InlineDate label={`Deadline for ${item.title}`} value={item.deadline} onChange={(v) => save(item, "deadline", v)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <BulkBar selection={selection} noun={{ one: "opportunity", many: "opportunities" }} pending={bulk.remove.isPending} onDelete={(ids) => bulk.remove.mutateAsync({ ids }).then(selection.clear, () => undefined)}>
          <BulkPicker label="Status" options={RESEARCH_STATUSES} disabled={bulk.update.isPending} onPick={bulkSet("status")} renderValue={(v) => <StatusBadge status={v} />} />
        </BulkBar>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/research/${item.id}`} className="block h-full rounded-2xl border bg-card p-4 shadow-card transition-shadow hover:shadow-lift">
              <p className="font-semibold break-words">{item.title}</p>
              <p className="text-sm break-words text-muted-foreground">{item.organization}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
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
      className="block cursor-grab rounded-xl border bg-card p-3 pr-11 text-card-foreground select-none"
    >
      <p className="text-sm font-semibold break-words">{item.title}</p>
      <p className="text-xs break-words text-muted-foreground">{item.organization}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ResearchMeta item={item} />
      </div>
    </Link>
  );
}
