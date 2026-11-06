"use client";

import { use } from "react";
import { ActivityTimeline } from "@/components/entity/activity-timeline";
import { Field, TextSection, UrlValue } from "@/components/entity/detail-parts";
import { EntityDetailPage } from "@/components/entity/entity-detail-page";
import { LinkedContacts } from "@/components/entity/linked-contacts";
import { NotesPanel } from "@/components/entity/notes-panel";
import { RemindersPanel } from "@/components/entity/reminders-panel";
import { DocumentChecklist } from "@/components/research/document-checklist";
import { PublicationLinks } from "@/components/research/publication-links";
import { ResearchFormDialog } from "@/components/research/research-form";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FUNDING_STATUSES, OPPORTUNITY_TYPES, optionLabel } from "@/lib/enums";
import { formatDateOnly } from "@/lib/format";
import type { Research } from "@/lib/types";

function ResearchDetails({ item }: { item: Research }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Type">{optionLabel(OPPORTUNITY_TYPES, item.opportunity_type)}</Field>
          <Field label="Funding">{optionLabel(FUNDING_STATUSES, item.funding_status)}</Field>
          <Field label="Funding amount">{item.funding_amount}</Field>
          <Field label="Country">{item.country}</Field>
          <Field label="Department">{item.department}</Field>
          <Field label="Laboratory">{item.laboratory}</Field>
          <Field label="Research area">{item.research_area}</Field>
          <Field label="Application date">{formatDateOnly(item.application_date)}</Field>
          <Field label="Deadline">{formatDateOnly(item.deadline)}</Field>
          <Field label="Professor">{item.professor_name}</Field>
          <Field label="Professor email">{item.professor_email}</Field>
          <Field label="Professor website">{item.professor_website ? <UrlValue value={item.professor_website} /> : null}</Field>
          <Field label="Website">{item.website ? <UrlValue value={item.website} /> : null}</Field>
          <Field label="Application URL">{item.application_url ? <UrlValue value={item.application_url} /> : null}</Field>
        </dl>
        {item.research_interests.length > 0 ? (
          <section>
            <h3 className="mb-1.5 text-xs text-muted-foreground">Research interests</h3>
            <ul className="flex flex-wrap gap-1.5">
              {item.research_interests.map((tag) => (
                <li key={tag}>
                  <Badge variant="secondary" className="max-w-full break-all whitespace-normal">
                    {tag}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <TextSection title="Description" value={item.description} />
        <TextSection title="Eligibility" value={item.eligibility} />
        <TextSection title="Language test requirements" value={item.language_test_requirements} />
        <TextSection title="Notes" value={item.notes} />
      </CardContent>
    </Card>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <EntityDetailPage<Research>
      type="research"
      id={id}
      path="/research"
      noun="research opportunity"
      backLabel="Research opportunities"
      title={(item) => item.title}
      description={(item) => item.organization}
      deleteDescription="This deletes the opportunity together with its notes and reminders. Linked contacts are kept. This cannot be undone."
      badges={(item) => <StatusBadge status={item.status} />}
      renderEdit={(item, open, onOpenChange) => <ResearchFormDialog open={open} onOpenChange={onOpenChange} research={item} />}
    >
      {(item) => (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <ResearchDetails item={item} />
          </div>
          <div className="space-y-6">
            <DocumentChecklist research={item} />
            <PublicationLinks research={item} />
            <NotesPanel entityType="research" entityId={item.id} />
          </div>
          <div className="space-y-6">
            <LinkedContacts entityType="research" entityId={item.id} />
            <RemindersPanel relatedType="research" relatedId={item.id} />
            <ActivityTimeline entityType="research" entityId={item.id} />
          </div>
        </div>
      )}
    </EntityDetailPage>
  );
}
