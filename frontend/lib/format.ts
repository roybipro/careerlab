/**
 * Date-only fields ("YYYY-MM-DD": deadline, follow_up_date, application_date) are never turned
 * into a Date in the viewer's time zone: that would show the wrong day west of UTC. They are
 * formatted in UTC from the parts of the string, so the day is always the one that was stored.
 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = DATE_ONLY.exec(value);
  if (!m) return value;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

/** Timestamps (interview_at, due_at, created_at) are shown in the browser's time zone. */
export function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** API timestamp -> value for <input type="datetime-local"> in the browser's time zone. */
export function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value (no offset) -> UTC ISO string with an offset, as the API requires. */
export function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString();
}

/** Stored URLs are only rendered as links when they start with http(s). */
export function safeHttpUrl(value: string | null | undefined): string | null {
  return value && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
}

const PERIOD_SUFFIX: Record<string, string> = { hourly: " / hour", monthly: " / month", yearly: " / year", stipend: " (stipend)" };

/**
 * The salary range with its pay period: "20 - 25 USD / hour", "1,800 - 2,200 EUR (stipend)". Unpaid is
 * "Unpaid" whatever amounts are stored. Without amounts and not unpaid there is nothing to show.
 */
export function formatSalary(min: number | null, max: number | null, currency: string | null, period: string | null = null): string | null {
  if (period === "unpaid") return "Unpaid";
  if (min === null && max === null) return null;
  const n = (v: number) => v.toLocaleString();
  const range = min !== null && max !== null ? `${n(min)} - ${n(max)}` : min !== null ? `from ${n(min)}` : `up to ${n(max as number)}`;
  return `${currency ? `${range} ${currency}` : range}${period ? (PERIOD_SUFFIX[period] ?? "") : ""}`;
}

const MS_PER_DAY = 86_400_000;

function dateOnlyUtc(value: string): number | null {
  const m = DATE_ONLY.exec(value);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/**
 * How long a start-to-end span is, in words: "5 days", "6 weeks", "3 months", "1 year". Both ends
 * count (June 1 to August 31 is 3 months). Works on the parts of the "YYYY-MM-DD" strings, never on
 * a Date in the viewer's time zone. Null when either date is missing or the end is before the start.
 */
export function formatDuration(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!start || !end) return null;
  const from = dateOnlyUtc(start);
  const to = dateOnlyUtc(end);
  if (from === null || to === null || to < from) return null;
  const days = Math.round((to - from) / MS_PER_DAY) + 1;
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (days < 14) return plural(days, "day");
  if (days < 60) return plural(Math.round(days / 7), "week");
  const months = Math.round(days / 30.44);
  if (months >= 12 && months % 12 === 0) return plural(months / 12, "year");
  return plural(months, "month");
}

/**
 * The browser's local date as "YYYY-MM-DD". The API has no user time zone, so date-only
 * comparisons ("due today") use this, sent as the `today` query parameter.
 */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Calendar days from today to a date-only value or timestamp, in the browser's time zone. Negative means past. */
export function daysFromToday(value: string, now: Date = new Date()): number {
  const m = DATE_ONLY.exec(value);
  const d = m ? null : new Date(value);
  const due = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Date.UTC(d!.getFullYear(), d!.getMonth(), d!.getDate());
  return Math.round((due - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
}

/** How soon a due date is, in words. */
export function dueLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;
  return days === -1 ? "1 day late" : `${-days} days late`;
}

/** Month and day for a date chip, from a date-only value or a timestamp. */
export function dateChipParts(value: string): { month: string; day: string } {
  const m = DATE_ONLY.exec(value);
  const date = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : new Date(value);
  const timeZone = m ? "UTC" : undefined;
  return {
    month: new Intl.DateTimeFormat(undefined, { month: "short", timeZone }).format(date),
    day: new Intl.DateTimeFormat(undefined, { day: "numeric", timeZone }).format(date),
  };
}

/** "Alex Demo" -> "AD". */
export function initials(name: string | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter((part) => part && !/^(dr|prof|mr|mrs|ms)\.?$/i.test(part))
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
