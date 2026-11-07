import {
  Archive,
  BookCheck,
  BookOpen,
  Bookmark,
  BriefcaseBusiness,
  CalendarClock,
  ChevronDown,
  ChevronsUp,
  Circle,
  CircleCheck,
  CirclePause,
  CircleX,
  ClipboardCheck,
  Compass,
  Equal,
  FilePenLine,
  FileText,
  FileUp,
  FlaskConical,
  GraduationCap,
  Hourglass,
  Landmark,
  Lightbulb,
  Mail,
  MessagesSquare,
  Microscope,
  PencilLine,
  PenLine,
  Send,
  Star,
  Trophy,
  Undo2,
  UserRound,
  UserSearch,
  type LucideIcon,
} from "lucide-react";

export type Option = { value: string; label: string };

export type EntityType = "job" | "research" | "contact" | "project";

type ToneClasses = {
  /** Soft badge background and text. */
  badge: string;
  /** Solid colour for a dot or a pipeline segment. */
  dot: string;
  /** Light background for a Kanban column. */
  tint: string;
};

/** Colours come from the --tone-* tokens in globals.css, which are checked for WCAG AA in both modes. */
const tone = {
  slate: { badge: "bg-tone-slate-soft text-tone-slate-fg", dot: "bg-tone-slate", tint: "bg-tone-slate-tint" },
  sky: { badge: "bg-tone-sky-soft text-tone-sky-fg", dot: "bg-tone-sky", tint: "bg-tone-sky-tint" },
  blue: { badge: "bg-tone-blue-soft text-tone-blue-fg", dot: "bg-tone-blue", tint: "bg-tone-blue-tint" },
  teal: { badge: "bg-tone-teal-soft text-tone-teal-fg", dot: "bg-tone-teal", tint: "bg-tone-teal-tint" },
  violet: { badge: "bg-tone-violet-soft text-tone-violet-fg", dot: "bg-tone-violet", tint: "bg-tone-violet-tint" },
  amber: { badge: "bg-tone-amber-soft text-tone-amber-fg", dot: "bg-tone-amber", tint: "bg-tone-amber-tint" },
  green: { badge: "bg-tone-green-soft text-tone-green-fg", dot: "bg-tone-green", tint: "bg-tone-green-tint" },
  red: { badge: "bg-tone-red-soft text-tone-red-fg", dot: "bg-tone-red", tint: "bg-tone-red-tint" },
  stone: { badge: "bg-tone-stone-soft text-tone-stone-fg", dot: "bg-tone-stone", tint: "bg-tone-stone-tint" },
} satisfies Record<string, ToneClasses>;

type StatusMeta = ToneClasses & { label: string; icon: LucideIcon };

/** Job, research, project stage and submission statuses share one table: a status looks the same in badges, Kanban and pipelines. */
export const STATUS_META: Record<string, StatusMeta> = {
  // Jobs
  wishlist: { label: "Wishlist", icon: Bookmark, ...tone.slate },
  preparing: { label: "Preparing", icon: PencilLine, ...tone.sky },
  applied: { label: "Applied", icon: Send, ...tone.blue },
  assessment: { label: "Assessment", icon: ClipboardCheck, ...tone.violet },
  interview: { label: "Interview", icon: MessagesSquare, ...tone.amber },
  offer: { label: "Offer", icon: Trophy, ...tone.green },
  rejected: { label: "Rejected", icon: CircleX, ...tone.red },
  withdrawn: { label: "Withdrawn", icon: Undo2, ...tone.stone },
  // Research
  discovered: { label: "Discovered", icon: Compass, ...tone.slate },
  interested: { label: "Interested", icon: Star, ...tone.sky },
  contacted_professor: { label: "Contacted professor", icon: Mail, ...tone.teal },
  preparing_documents: { label: "Preparing documents", icon: FileText, ...tone.violet },
  accepted: { label: "Accepted", icon: CircleCheck, ...tone.green },
  archived: { label: "Archived", icon: Archive, ...tone.stone },
  // Research project stages
  idea: { label: "Idea", icon: Lightbulb, ...tone.slate },
  literature_review: { label: "Literature review", icon: BookOpen, ...tone.sky },
  experiments: { label: "Experiments", icon: FlaskConical, ...tone.violet },
  writing: { label: "Writing", icon: PenLine, ...tone.blue },
  submitting: { label: "Submitting", icon: FileUp, ...tone.amber },
  published: { label: "Published", icon: BookCheck, ...tone.green },
  paused: { label: "Paused", icon: CirclePause, ...tone.stone },
  // Submission statuses (accepted, rejected and withdrawn are above and look the same)
  planned: { label: "Planned", icon: CalendarClock, ...tone.slate },
  submitted: { label: "Submitted", icon: Send, ...tone.blue },
  under_review: { label: "Under review", icon: Hourglass, ...tone.amber },
  revisions_requested: { label: "Revisions requested", icon: FilePenLine, ...tone.violet },
};

/** Style and icon for a status. An unknown value gets the neutral tone. */
export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? { label: humanize(status), icon: Circle, ...tone.slate };
}

export function statusLabel(status: string): string {
  return STATUS_META[status]?.label ?? humanize(status);
}

/** "contacted_professor" -> "Contacted professor". Fallback for values with no entry above. */
export function humanize(value: string): string {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const options = (values: string[]): Option[] => values.map((value) => ({ value, label: statusLabel(value) }));

export const JOB_STATUSES = options([
  "wishlist",
  "preparing",
  "applied",
  "assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
]);

export const PRIORITIES: Option[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export const PRIORITY_BADGE: Record<string, string> = {
  low: tone.slate.badge,
  medium: tone.blue.badge,
  high: tone.red.badge,
};

export const PRIORITY_ICON: Record<string, LucideIcon> = {
  low: ChevronDown,
  medium: Equal,
  high: ChevronsUp,
};

export const JOB_TYPES: Option[] = [
  { value: "on_site", label: "On site" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
];

export const EMPLOYMENT_TYPES: Option[] = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "internship", label: "Internship" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
  { value: "co_op", label: "Co-op" },
  { value: "apprenticeship", label: "Apprenticeship" },
  { value: "freelance", label: "Freelance" },
  { value: "graduate_program", label: "Graduate program" },
];

/** Employment types that can carry academic credit. Also the "Internships" category in the job list. */
export const INTERNSHIP_TYPES = ["internship", "co_op"];

export const JOB_SOURCES: Option[] = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "company_website", label: "Company website" },
  { value: "referral", label: "Referral" },
  { value: "job_board", label: "Job board" },
  { value: "university_career_center", label: "University career center" },
  { value: "recruiter", label: "Recruiter" },
  { value: "other", label: "Other" },
];

export const PAY_PERIODS: Option[] = [
  { value: "hourly", label: "Hourly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "stipend", label: "Stipend" },
  { value: "unpaid", label: "Unpaid" },
];

export const VISA_SPONSORSHIP: Option[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Unknown" },
];

export const ACADEMIC_CREDIT: Option[] = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

/** The All / Jobs / Internships switch above the job list. "" means All. */
export const JOB_CATEGORIES: Option[] = [
  { value: "", label: "All" },
  { value: "jobs", label: "Jobs" },
  { value: "internships", label: "Internships" },
];

export const NOTE_KINDS: Option[] = [
  { value: "note", label: "Note" },
  { value: "interview_feedback", label: "Interview feedback" },
  { value: "communication", label: "Communication" },
];

export const CONTACT_TYPES: Option[] = [
  { value: "recruiter", label: "Recruiter" },
  { value: "professor", label: "Professor" },
  { value: "researcher", label: "Researcher" },
  { value: "hiring_manager", label: "Hiring manager" },
  { value: "university_representative", label: "University representative" },
  { value: "other", label: "Other" },
];

export const CONTACT_TYPE_ICON: Record<string, LucideIcon> = {
  recruiter: UserSearch,
  professor: GraduationCap,
  researcher: Microscope,
  hiring_manager: BriefcaseBusiness,
  university_representative: Landmark,
  other: UserRound,
};

export function optionLabel(list: Option[], value: string | null | undefined): string | null {
  if (!value) return null;
  return list.find((o) => o.value === value)?.label ?? humanize(value);
}

export const RESEARCH_STATUSES = options([
  "discovered",
  "interested",
  "contacted_professor",
  "preparing_documents",
  "applied",
  "interview",
  "accepted",
  "rejected",
  "archived",
]);

export const OPPORTUNITY_TYPES: Option[] = [
  { value: "research_assistant", label: "Research assistant" },
  { value: "research_internship", label: "Research internship" },
  { value: "graduate_research_program", label: "Graduate research program" },
  { value: "fully_funded_phd", label: "Fully funded PhD" },
  { value: "masters_scholarship", label: "Master's scholarship" },
  { value: "fellowship", label: "Fellowship" },
  { value: "research_collaboration", label: "Research collaboration" },
  { value: "visiting_researcher", label: "Visiting researcher" },
];

export const FUNDING_STATUSES: Option[] = [
  { value: "fully_funded", label: "Fully funded" },
  { value: "partially_funded", label: "Partially funded" },
  { value: "self_funded", label: "Self funded" },
  { value: "unknown", label: "Unknown" },
];

export const PROJECT_STAGES = options(["idea", "literature_review", "experiments", "writing", "submitting", "published", "paused"]);

export const PROJECT_TYPES: Option[] = [
  { value: "personal", label: "Personal" },
  { value: "university_course", label: "University course" },
  { value: "thesis", label: "Thesis" },
  { value: "research_group", label: "Research group" },
  { value: "other", label: "Other" },
];

export const SUBMISSION_STATUSES = options(["planned", "submitted", "under_review", "revisions_requested", "accepted", "rejected", "withdrawn"]);

export const VENUE_TYPES: Option[] = [
  { value: "conference", label: "Conference" },
  { value: "journal", label: "Journal" },
  { value: "workshop", label: "Workshop" },
  { value: "other", label: "Other" },
];

/** Stages that no longer count towards open work: no overdue or late alarms. Matches the API. */
export function isInactiveStage(stage: string): boolean {
  return stage === "published" || stage === "paused";
}

/** The All / Active switch above the project list. "" means All; Active leaves out published and paused projects. */
export const PROJECT_SCOPES: Option[] = [
  { value: "", label: "All" },
  { value: "true", label: "Active" },
];
