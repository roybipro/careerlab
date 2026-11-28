"use client";

import Link from "next/link";
import { BulkBar, BulkPicker, RowCheckbox, SelectAllCheckbox, useSelection } from "@/components/bulk-actions";
import { InlineDate, InlineSelect } from "@/components/inline-edit";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JOB_STATUSES, PRIORITIES } from "@/lib/enums";
import { formatDateOnly } from "@/lib/format";
import type { Job } from "@/lib/types";
import { useBulkActions } from "@/lib/use-bulk-actions";
import { useInlineUpdate } from "@/lib/use-inline-update";

function JobMeta({ job }: { job: Job }) {
  const deadline = formatDateOnly(job.deadline);
  return deadline ? <span className="text-xs text-muted-foreground">Deadline {deadline}</span> : null;
}

/** A table from `lg` up, a stack of cards below it. Status, priority and the two dates can be changed right in the table. */
export function JobsTable({ jobs }: { jobs: Job[] }) {
  const update = useInlineUpdate<Job>("job", "/jobs", (job) => job.company_name);
  const save = (job: Job, field: string, value: string | null) => update.mutate({ item: job, changes: { [field]: value } });
  const bulk = useBulkActions("job", "/jobs", { one: "job", many: "jobs" });
  const selection = useSelection(jobs.map((row) => row.id));
  const bulkSet = (field: string) => (value: string) =>
    bulk.update.mutate({ ids: selection.selected, changes: { [field]: value } }, { onSuccess: selection.clear });
  return (
    <>
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pr-0">
                <SelectAllCheckbox selection={selection} label="Select all jobs on this page" />
              </TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Applied</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id} data-state={selection.isSelected(job.id) ? "selected" : undefined} data-row tabIndex={-1}>
                <TableCell className="w-10 pr-0">
                  <RowCheckbox selection={selection} id={job.id} label={`Select ${job.company_name}`} />
                </TableCell>
                <TableCell className="max-w-56 font-medium whitespace-normal break-words">
                  <Link data-row-open href={`/jobs/${job.id}`} className="underline-offset-4 hover:text-link hover:underline">
                    {job.company_name}
                  </Link>
                </TableCell>
                <TableCell className="max-w-64 whitespace-normal break-words text-muted-foreground">{job.position_title}</TableCell>
                <TableCell>
                  <InlineSelect
                    label={`Status for ${job.company_name}`}
                    value={job.status}
                    options={JOB_STATUSES}
                    onChange={(v) => save(job, "status", v)}
                    renderValue={(v) => <StatusBadge status={v} />}
                  />
                </TableCell>
                <TableCell>
                  <InlineSelect
                    label={`Priority for ${job.company_name}`}
                    value={job.priority}
                    options={PRIORITIES}
                    onChange={(v) => save(job, "priority", v)}
                    renderValue={(v) => <PriorityBadge priority={v} />}
                  />
                </TableCell>
                <TableCell>
                  <InlineDate label={`Deadline for ${job.company_name}`} value={job.deadline} onChange={(v) => save(job, "deadline", v)} />
                </TableCell>
                <TableCell>
                  <InlineDate label={`Applied date for ${job.company_name}`} value={job.application_date} onChange={(v) => save(job, "application_date", v)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <BulkBar selection={selection} noun={{ one: "job", many: "jobs" }} pending={bulk.remove.isPending} onDelete={(ids) => bulk.remove.mutateAsync({ ids }).then(selection.clear, () => undefined)}>
          <BulkPicker label="Status" options={JOB_STATUSES} disabled={bulk.update.isPending} onPick={bulkSet("status")} renderValue={(v) => <StatusBadge status={v} />} />
          <BulkPicker label="Priority" options={PRIORITIES} disabled={bulk.update.isPending} onPick={bulkSet("priority")} renderValue={(v) => <PriorityBadge priority={v} />} />
        </BulkBar>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link data-row-open href={`/jobs/${job.id}`} className="block h-full rounded-2xl border bg-card p-4 shadow-card transition-shadow hover:shadow-lift">
              <p className="font-semibold break-words">{job.company_name}</p>
              <p className="text-sm break-words text-muted-foreground">{job.position_title}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={job.status} />
                <PriorityBadge priority={job.priority} />
                <JobMeta job={job} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The card shown on the Kanban board. Leaves room on the right for the board's status menu. */
export function JobKanbanCard({ job }: { job: Job }) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      draggable={false}
      className="block cursor-grab rounded-xl border bg-card p-3 pr-11 text-card-foreground select-none"
    >
      <p className="text-sm font-semibold break-words">{job.company_name}</p>
      <p className="text-xs break-words text-muted-foreground">{job.position_title}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PriorityBadge priority={job.priority} />
        <JobMeta job={job} />
      </div>
    </Link>
  );
}
