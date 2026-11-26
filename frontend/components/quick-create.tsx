"use client";

import { Bell, Briefcase, Contact, FlaskConical, FolderKanban, type LucideIcon } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { ContactFormDialog } from "@/components/contacts/contact-form";
import { JobFormDialog } from "@/components/jobs/job-form";
import { ProjectFormDialog } from "@/components/projects/project-form";
import { ReminderFormDialog } from "@/components/reminders/reminder-form";
import { ResearchFormDialog } from "@/components/research/research-form";

export type CreateKind = "job" | "research" | "project" | "contact" | "reminder";

/** Everything you can add, in the order the "New" menu and the command palette list it. */
export const CREATE_ITEMS: { kind: CreateKind; label: string; hint: string; icon: LucideIcon }[] = [
  { kind: "job", label: "Job application", hint: "Track a role you want or applied to", icon: Briefcase },
  { kind: "research", label: "Research opportunity", hint: "A lab, program or position", icon: FlaskConical },
  { kind: "project", label: "Research project", hint: "A paper or project with milestones", icon: FolderKanban },
  { kind: "contact", label: "Contact", hint: "A recruiter, professor or referral", icon: Contact },
  { kind: "reminder", label: "Reminder", hint: "A follow-up or deadline to remember", icon: Bell },
];

const QuickCreateContext = createContext<(kind: CreateKind) => void>(() => {});

/** Opens one of the "add" dialogs from anywhere in the app: the New menu, the command palette or the tab bar. */
export function useQuickCreate() {
  return useContext(QuickCreateContext);
}

export function QuickCreateProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<CreateKind | null>(null);
  const close = (next: boolean) => !next && setOpen(null);
  return (
    <QuickCreateContext.Provider value={setOpen}>
      {children}
      <JobFormDialog open={open === "job"} onOpenChange={close} />
      <ResearchFormDialog open={open === "research"} onOpenChange={close} />
      <ProjectFormDialog open={open === "project"} onOpenChange={close} />
      <ContactFormDialog open={open === "contact"} onOpenChange={close} />
      <ReminderFormDialog open={open === "reminder"} onOpenChange={close} />
    </QuickCreateContext.Provider>
  );
}
