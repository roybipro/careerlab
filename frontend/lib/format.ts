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

export function formatSalary(min: number | null, max: number | null, currency: string | null): string | null {
  if (min === null && max === null) return null;
  const n = (v: number) => v.toLocaleString();
  const range = min !== null && max !== null ? `${n(min)} - ${n(max)}` : min !== null ? `from ${n(min)}` : `up to ${n(max as number)}`;
  return currency ? `${range} ${currency}` : range;
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
