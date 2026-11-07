import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { MilestoneProgress } from "@/components/projects/milestone-progress";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PROJECT_TYPES, optionLabel } from "@/lib/enums";
import { formatDateOnly } from "@/lib/format";
import type { Project } from "@/lib/types";

// Titles are free text: a long one wraps, and a single long word breaks, instead of widening the card or column.
const WRAP = "[overflow-wrap:anywhere]";

function subtitle(project: Project): string | null {
  return [project.topic, project.institution].filter(Boolean).join(" · ") || null;
}

/** A project with only overdue items has no next deadline; this says so in text and colour, not colour alone. */
function OverdueMark() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      Overdue
    </span>
  );
}

function NextDeadline({ project }: { project: Project }) {
  const date = formatDateOnly(project.next_deadline);
  if (date) return <span className="text-xs text-muted-foreground">Next deadline {date}</span>;
  return project.has_overdue ? <OverdueMark /> : null;
}

function TargetDate({ project }: { project: Project }) {
  const date = formatDateOnly(project.target_date);
  return date ? <span className="text-xs text-muted-foreground">Target {date}</span> : null;
}

/** A table from `lg` up, a stack of cards below it. */
export function ProjectsTable({ projects }: { projects: Project[] }) {
  return (
    <>
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Milestones</TableHead>
              <TableHead>Next deadline</TableHead>
              <TableHead>Target date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell className={`max-w-80 font-medium whitespace-normal ${WRAP}`}>
                  <Link href={`/projects/${project.id}`} className="underline-offset-4 hover:text-link hover:underline">
                    {project.title}
                  </Link>
                  {subtitle(project) ? <p className="text-sm font-normal text-muted-foreground">{subtitle(project)}</p> : null}
                </TableCell>
                <TableCell className="text-muted-foreground">{optionLabel(PROJECT_TYPES, project.project_type) ?? "-"}</TableCell>
                <TableCell>
                  <StatusBadge status={project.stage} />
                </TableCell>
                <TableCell className="min-w-40">
                  {project.milestones_total > 0 ? <MilestoneProgress done={project.milestones_done} total={project.milestones_total} /> : <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">{formatDateOnly(project.next_deadline) ?? (project.has_overdue ? <OverdueMark /> : "-")}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">{formatDateOnly(project.target_date) ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden">
        {projects.map((project) => (
          <li key={project.id} className="min-w-0">
            <Link href={`/projects/${project.id}`} className="block h-full rounded-2xl border bg-card p-4 shadow-card transition-shadow hover:shadow-lift">
              <p className={`font-semibold ${WRAP}`}>{project.title}</p>
              {subtitle(project) ? <p className={`text-sm text-muted-foreground ${WRAP}`}>{subtitle(project)}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={project.stage} />
                <span className="text-xs text-muted-foreground">{optionLabel(PROJECT_TYPES, project.project_type)}</span>
                <NextDeadline project={project} />
                <TargetDate project={project} />
              </div>
              <MilestoneProgress done={project.milestones_done} total={project.milestones_total} className="mt-3" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The card shown on the Kanban board. Leaves room on the right for the board's status menu. */
export function ProjectKanbanCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      draggable={false}
      className="block cursor-grab rounded-xl border bg-card p-3 pr-11 text-card-foreground select-none"
    >
      <p className={`line-clamp-3 text-sm font-semibold ${WRAP}`}>{project.title}</p>
      <p className="text-xs text-muted-foreground">{optionLabel(PROJECT_TYPES, project.project_type)}</p>
      <MilestoneProgress done={project.milestones_done} total={project.milestones_total} className="mt-2" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <NextDeadline project={project} />
        <TargetDate project={project} />
      </div>
    </Link>
  );
}
