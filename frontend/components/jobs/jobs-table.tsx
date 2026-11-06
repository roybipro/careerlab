import Link from "next/link";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateOnly } from "@/lib/format";
import type { Job } from "@/lib/types";

function JobMeta({ job }: { job: Job }) {
  const deadline = formatDateOnly(job.deadline);
  return deadline ? <span className="text-xs text-muted-foreground">Deadline {deadline}</span> : null;
}

/** A table from `md` up, a stack of cards below it. */
export function JobsTable({ jobs }: { jobs: Job[] }) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
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
              <TableRow key={job.id}>
                <TableCell className="font-medium">
                  <Link href={`/jobs/${job.id}`} className="underline-offset-4 hover:underline">
                    {job.company_name}
                  </Link>
                </TableCell>
                <TableCell>{job.position_title}</TableCell>
                <TableCell>
                  <StatusBadge status={job.status} />
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={job.priority} />
                </TableCell>
                <TableCell>{formatDateOnly(job.deadline) ?? "-"}</TableCell>
                <TableCell>{formatDateOnly(job.application_date) ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="space-y-3 md:hidden">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link href={`/jobs/${job.id}`} className="block rounded-xl border p-3 hover:bg-muted/50">
              <p className="font-medium break-words">{job.company_name}</p>
              <p className="text-sm break-words text-muted-foreground">{job.position_title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
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
      className="block cursor-grab rounded-lg border bg-card p-3 pr-10 text-card-foreground select-none hover:border-ring/50"
    >
      <p className="text-sm font-medium break-words">{job.company_name}</p>
      <p className="text-xs break-words text-muted-foreground">{job.position_title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <PriorityBadge priority={job.priority} />
        <JobMeta job={job} />
      </div>
    </Link>
  );
}
