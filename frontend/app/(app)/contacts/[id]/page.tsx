"use client";

import { use } from "react";
import { ContactFormDialog } from "@/components/contacts/contact-form";
import { LinkedOpportunities } from "@/components/contacts/linked-opportunities";
import { ActivityTimeline } from "@/components/entity/activity-timeline";
import { Field, TextSection, UrlValue } from "@/components/entity/detail-parts";
import { EntityDetailPage } from "@/components/entity/entity-detail-page";
import { NotesPanel } from "@/components/entity/notes-panel";
import { RemindersPanel } from "@/components/entity/reminders-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CONTACT_TYPES, optionLabel } from "@/lib/enums";
import { formatDateOnly } from "@/lib/format";
import type { ContactDetail } from "@/lib/types";

function ContactDetails({ item }: { item: ContactDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Email">{item.email}</Field>
          <Field label="Organization">{item.organization}</Field>
          <Field label="Position">{item.position}</Field>
          <Field label="LinkedIn">{item.linkedin_url ? <UrlValue value={item.linkedin_url} /> : null}</Field>
          <Field label="Website">{item.website ? <UrlValue value={item.website} /> : null}</Field>
          <Field label="Last contacted">{formatDateOnly(item.last_contacted_at)}</Field>
          <Field label="Next follow-up">{formatDateOnly(item.next_follow_up_at)}</Field>
        </dl>
        <TextSection title="Notes" value={item.notes} />
      </CardContent>
    </Card>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <EntityDetailPage<ContactDetail>
      type="contact"
      id={id}
      path="/contacts"
      noun="contact"
      backLabel="Contacts"
      title={(item) => item.name}
      description={(item) => [item.position, item.organization].filter(Boolean).join(" at ")}
      deleteDescription="This deletes the contact together with its notes, reminders and links to jobs and research. The jobs and research opportunities themselves are kept. This cannot be undone."
      badges={(item) => (item.contact_type ? <Badge variant="secondary">{optionLabel(CONTACT_TYPES, item.contact_type)}</Badge> : null)}
      renderEdit={(item, open, onOpenChange) => <ContactFormDialog open={open} onOpenChange={onOpenChange} contact={item} />}
    >
      {(item) => (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <ContactDetails item={item} />
          </div>
          <div className="space-y-6">
            <LinkedOpportunities contact={item} />
            <NotesPanel entityType="contact" entityId={item.id} kind="communication" title="Communication history" />
          </div>
          <div className="space-y-6">
            <RemindersPanel relatedType="contact" relatedId={item.id} />
            <ActivityTimeline entityType="contact" entityId={item.id} />
          </div>
        </div>
      )}
    </EntityDetailPage>
  );
}
