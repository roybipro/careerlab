"use client";

import { CalendarClock, FolderKanban, Info, Landmark, Shapes } from "lucide-react";
import { use } from "react";
import { ActivityTimeline } from "@/components/entity/activity-timeline";
import { Field, TextSection } from "@/components/entity/detail-parts";
import { EntityDetailPage } from "@/components/entity/entity-detail-page";
import { NotesPanel } from "@/components/entity/notes-panel";
import { RemindersPanel } from "@/components/entity/reminders-panel";
import { MilestonesPanel } from "@/components/projects/milestones-panel";
import { ProjectFormDialog } from "@/components/projects/project-form";
import { SubmissionsPanel } from "@/components/projects/submissions-panel";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PROJECT_TYPES, optionLabel } from "@/lib/enums";
import { formatDateOnly } from "@/lib/format";
import type { Project } from "@/lib/types";

function ProjectDetails({ project }: { project: Project }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Info aria-hidden="true" />
          Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Type" icon={Shapes}>{optionLabel(PROJECT_TYPES, project.project_type)}</Field>
          <Field label="Topic" icon={FolderKanban}>{project.topic}</Field>
          <Field label="Institution" icon={Landmark}>{project.institution}</Field>
          <Field label="Target date" icon={CalendarClock}>{formatDateOnly(project.target_date)}</Field>
        </dl>
        <TextSection title="Description" value={project.description} />
        <TextSection title="Notes" value={project.notes} />
      </CardContent>
    </Card>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <EntityDetailPage<Project>
      type="project"
      id={id}
      path="/projects"
      noun="research project"
      backLabel="Research Projects"
      title={(project) => project.title}
      description={(project) => [project.topic, project.institution].filter(Boolean).join(" · ") || "Research project"}
      deleteDescription="This deletes the project together with its submissions, milestones, notes and reminders. This cannot be undone."
      badges={(project) => (
        <>
          <StatusBadge status={project.stage} />
          <Badge variant="outline">{optionLabel(PROJECT_TYPES, project.project_type)}</Badge>
        </>
      )}
      renderEdit={(project, open, onOpenChange) => <ProjectFormDialog open={open} onOpenChange={onOpenChange} project={project} />}
    >
      {(project) => (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <ProjectDetails project={project} />
          </div>
          <div className="min-w-0 space-y-6">
            <SubmissionsPanel projectId={project.id} stage={project.stage} />
            <MilestonesPanel projectId={project.id} stage={project.stage} />
          </div>
          <div className="min-w-0 space-y-6">
            <NotesPanel entityType="project" entityId={project.id} />
            <RemindersPanel relatedType="project" relatedId={project.id} />
            <ActivityTimeline entityType="project" entityId={project.id} />
          </div>
        </div>
      )}
    </EntityDetailPage>
  );
}
