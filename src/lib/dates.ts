/**
 * Date helpers pinned to one application timezone (default Asia/Jakarta, UTC+7, no daylight saving).
 *
 * Deadlines are calendar dates. They are stored as the instant of 00:00 in the app timezone,
 * so "today", "overdue" and "due this week" are always evaluated against that calendar day,
 * regardless of the machine's own timezone.
 *
 * The timezone comes from NEXT_PUBLIC_APP_TIMEZONE in .env. Only fixed-offset zones are supported
 * (no daylight saving), which keeps date arithmetic exact. Restart the server after changing it.
 */
const TZ_OFFSETS: Record<string, string> = {
  "Asia/Jakarta": "+07:00",
  "Asia/Makassar": "+08:00",
  "Asia/Jayapura": "+09:00",
  "Asia/Bangkok": "+07:00",
  "Asia/Singapore": "+08:00",
  UTC: "+00:00",
};
export const SUPPORTED_TIMEZONES = Object.keys(TZ_OFFSETS);

const requested = process.env.NEXT_PUBLIC_APP_TIMEZONE;
export const APP_TZ = requested && requested in TZ_OFFSETS ? requested : "Asia/Jakarta";
const OFFSET = TZ_OFFSETS[APP_TZ];
/** The app timezone's offset from UTC in minutes (e.g. 420 for Asia/Jakarta). Used to write wall-clock times into Excel. */
export const APP_OFFSET_MINUTES = (OFFSET.startsWith("-") ? -1 : 1) * (Number(OFFSET.slice(1, 3)) * 60 + Number(OFFSET.slice(4, 6)));
const DAY_MS = 86_400_000;

const keyFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** "2026-11-19" for the calendar day containing `d` in the app timezone. */
export function dateKey(d: Date): string {
  return keyFormatter.format(d);
}

export function parseDateKey(key: string): Date {
  return new Date(`${key}T00:00:00${OFFSET}`);
}

export function startOfToday(now: Date = new Date()): Date {
  return parseDateKey(dateKey(now));
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Monday 00:00 of the week containing `now`. */
export function startOfWeek(now: Date = new Date()): Date {
  const today = startOfToday(now);
  const dow = new Date(`${dateKey(now)}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(today, -((dow + 6) % 7));
}

/** Whole calendar days from today to `d` (negative = in the past). */
export function daysFromToday(d: Date, now: Date = new Date()): number {
  return Math.round((startOfToday(d).getTime() - startOfToday(now).getTime()) / DAY_MS);
}

/** Whole calendar days elapsed since `d` (>= 0 for past dates). */
export function daysSince(d: Date, now: Date = new Date()): number {
  return -daysFromToday(d, now);
}

/** Value for <input type="date">. */
export function toInputDate(d?: Date | null): string {
  return d ? dateKey(d) : "";
}

export function fromInputDate(s?: string | null): Date | null {
  return s ? parseDateKey(s) : null;
}

// ---------- display formats (a user setting) ----------

export const DATE_FORMATS = ["dd MMM yyyy", "yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

let activeFormat: DateFormat = "dd MMM yyyy";
/** Called once per render by the root layout (server) and by a tiny client component (browser). */
export function setDateFormat(f: DateFormat) {
  activeFormat = f;
}

const displayFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, day: "2-digit", month: "short", year: "numeric" });
const numericParts = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const shortDateTime = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const timeOnly = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, hour: "2-digit", minute: "2-digit", hour12: false });

export function formatDateAs(d: Date, f: DateFormat): string {
  if (f === "yyyy-MM-dd") return dateKey(d);
  if (f === "dd MMM yyyy") return displayFormatter.format(d);
  const p = Object.fromEntries(numericParts.formatToParts(d).map((x) => [x.type, x.value]));
  return f === "dd/MM/yyyy" ? `${p.day}/${p.month}/${p.year}` : `${p.month}/${p.day}/${p.year}`;
}

export function formatDate(d?: Date | null): string {
  return d ? formatDateAs(d, activeFormat) : "—";
}

export function formatDateTime(d: Date): string {
  return activeFormat === "dd MMM yyyy" ? shortDateTime.format(d) : `${formatDateAs(d, activeFormat)} ${timeOnly.format(d)}`;
}

/** Human label for a deadline, e.g. "Overdue by 2 days", "Due today", "Due in 3 days". */
export function dueLabel(d?: Date | null, now: Date = new Date()): string | null {
  if (!d) return null;
  const n = daysFromToday(d, now);
  if (n < 0) return `Overdue by ${-n} ${-n === 1 ? "day" : "days"}`;
  if (n === 0) return "Due today";
  if (n === 1) return "Due tomorrow";
  return `Due in ${n} days`;
}
