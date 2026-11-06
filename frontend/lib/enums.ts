export type Option = { value: string; label: string };

export type EntityType = "job" | "research" | "contact";

/** Colours are Tailwind classes for a soft badge, readable in light and dark mode. */
type StatusMeta = { label: string; badge: string };

const tone = {
  gray: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  green: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  stone: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
} as const;

/** Job and research statuses share one table: a status with the same name looks the same everywhere. */
export const STATUS_META: Record<string, StatusMeta> = {
  // Jobs
  wishlist: { label: "Wishlist", badge: tone.gray },
  preparing: { label: "Preparing", badge: tone.blue },
  applied: { label: "Applied", badge: tone.indigo },
  assessment: { label: "Assessment", badge: tone.violet },
  interview: { label: "Interview", badge: tone.amber },
  offer: { label: "Offer", badge: tone.green },
  rejected: { label: "Rejected", badge: tone.red },
  withdrawn: { label: "Withdrawn", badge: tone.stone },
  // Research
  discovered: { label: "Discovered", badge: tone.gray },
  interested: { label: "Interested", badge: tone.blue },
  contacted_professor: { label: "Contacted professor", badge: tone.indigo },
  preparing_documents: { label: "Preparing documents", badge: tone.violet },
  accepted: { label: "Accepted", badge: tone.green },
  archived: { label: "Archived", badge: tone.stone },
};

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
  low: tone.gray,
  medium: tone.blue,
  high: tone.red,
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

export function optionLabel(list: Option[], value: string | null | undefined): string | null {
  if (!value) return null;
  return list.find((o) => o.value === value)?.label ?? humanize(value);
}
