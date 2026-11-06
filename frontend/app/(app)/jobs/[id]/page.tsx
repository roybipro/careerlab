"use client";

import { Banknote, BriefcaseBusiness, CalendarCheck, CalendarClock, CalendarX, FileText, Globe, GraduationCap, Hourglass, Image, Info, Laptop, Link2, MapPin, Megaphone, MessagesSquare, Plane, Reply, Send, Wallet } from "lucide-react";
import { use } from "react";
import { ActivityTimeline } from "@/components/entity/activity-timeline";
import { Field, TextSection, UrlValue } from "@/components/entity/detail-parts";
import { EntityDetailPage } from "@/components/entity/entity-detail-page";
import { LinkedContacts } from "@/components/entity/linked-contacts";
import { NotesPanel } from "@/components/entity/notes-panel";
import { RemindersPanel } from "@/components/entity/reminders-panel";
import { JobFormDialog } from "@/components/jobs/job-form";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EMPLOYMENT_TYPES, JOB_SOURCES, JOB_TYPES, PAY_PERIODS, VISA_SPONSORSHIP, optionLabel } from "@/lib/enums";
import { formatDateOnly, formatDateTime, formatDuration, formatSalary } from "@/lib/format";
import type { Job } from "@/lib/types";

function JobDetails({ job }: { job: Job }) {
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
          <Field label="Location" icon={MapPin}>{job.location}</Field>
          <Field label="Job type" icon={Laptop}>{optionLabel(JOB_TYPES, job.job_type)}</Field>
          <Field label="Employment type" icon={BriefcaseBusiness}>{optionLabel(EMPLOYMENT_TYPES, job.employment_type)}</Field>
          <Field label="Source" icon={Megaphone}>{optionLabel(JOB_SOURCES, job.source)}</Field>
          <Field label="Salary" icon={Banknote}>{formatSalary(job.salary_min, job.salary_max, job.salary_currency, job.pay_period)}</Field>
          {/* A pay period with no amounts has no salary line to sit on, so it gets its own. */}
          {job.salary_min === null && job.salary_max === null && job.pay_period !== "unpaid" ? (
            <Field label="Pay period" icon={Wallet}>{optionLabel(PAY_PERIODS, job.pay_period)}</Field>
          ) : null}
          <Field label="Start date" icon={CalendarCheck}>{formatDateOnly(job.start_date)}</Field>
          <Field label="End date" icon={CalendarX}>{formatDateOnly(job.end_date)}</Field>
          <Field label="Duration" icon={Hourglass}>{formatDuration(job.start_date, job.end_date)}</Field>
          <Field label="Visa sponsorship" icon={Plane}>{optionLabel(VISA_SPONSORSHIP, job.visa_sponsorship)}</Field>
          <Field label="Academic credit" icon={GraduationCap}>{job.academic_credit === null ? null : job.academic_credit ? "Yes" : "No"}</Field>
          <Field label="Application date" icon={Send}>{formatDateOnly(job.application_date)}</Field>
          <Field label="Deadline" icon={CalendarClock}>{formatDateOnly(job.deadline)}</Field>
          <Field label="Follow-up date" icon={Reply}>{formatDateOnly(job.follow_up_date)}</Field>
          <Field label="Interview" icon={MessagesSquare}>{formatDateTime(job.interview_at)}</Field>
          <Field label="Resume version" icon={FileText}>{job.resume_version}</Field>
          <Field label="Job posting" icon={Link2}>{job.job_url ? <UrlValue value={job.job_url} /> : null}</Field>
          <Field label="Company website" icon={Globe}>{job.company_website ? <UrlValue value={job.company_website} /> : null}</Field>
          <Field label="Company logo" icon={Image}>{job.company_logo_url ? <UrlValue value={job.company_logo_url} /> : null}</Field>
        </dl>
        <TextSection title="Cover letter" value={job.cover_letter_ref} />
        <TextSection title="Job description" value={job.job_description} />
        <TextSection title="Notes" value={job.notes} />
      </CardContent>
    </Card>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <EntityDetailPage<Job>
      type="job"
      id={id}
      path="/jobs"
      noun="job"
      backLabel="Job applications"
      title={(job) => job.company_name}
      description={(job) => job.position_title}
      deleteDescription="This deletes the job application together with its notes and reminders. Linked contacts are kept. This cannot be undone."
      badges={(job) => (
        <>
          <StatusBadge status={job.status} />
          <PriorityBadge priority={job.priority} />
        </>
      )}
      renderEdit={(job, open, onOpenChange) => <JobFormDialog open={open} onOpenChange={onOpenChange} job={job} />}
    >
      {(job) => (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <JobDetails job={job} />
          </div>
          <div className="space-y-6">
            <NotesPanel entityType="job" entityId={job.id} />
            <LinkedContacts entityType="job" entityId={job.id} />
          </div>
          <div className="space-y-6">
            <RemindersPanel relatedType="job" relatedId={job.id} />
            <ActivityTimeline entityType="job" entityId={job.id} />
          </div>
        </div>
      )}
    </EntityDetailPage>
  );
}
