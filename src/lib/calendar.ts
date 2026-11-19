/** Calendar date math on plain yyyy-MM-dd keys (Jakarta calendar days). Pure and timezone-free. */
const DAY = 86_400_000;
const toDate = (k: string) => new Date(`${k}T00:00:00Z`);
export const toKey = (d: Date) => d.toISOString().slice(0, 10);
export const addDaysKey = (k: string, n: number) => toKey(new Date(toDate(k).getTime() + n * DAY));
export const startOfWeekKey = (k: string) => addDaysKey(k, -((toDate(k).getUTCDay() + 6) % 7));

export type CalView = "month" | "week" | "day";
export type CalKind = "task-due" | "task-followup" | "issue-followup" | "uat-target" | "milestone" | "plan";

export interface CalEvent {
  id: string;
  kind: CalKind;
  entityId: string;
  date: string;
  title: string;
  subtitle?: string;
  href: string;
  done?: boolean;
  overdue?: boolean;
}

export function monthGrid(k: string): string[][] {
  const [y, m] = k.split("-").map(Number);
  const first = `${k.slice(0, 7)}-01`;
  const start = startOfWeekKey(first);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = Math.round((toDate(first).getTime() - toDate(start).getTime()) / DAY);
  const weeks = Math.ceil((offset + days) / 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDaysKey(start, w * 7 + d)));
}

export const weekDays = (k: string) => Array.from({ length: 7 }, (_, i) => addDaysKey(startOfWeekKey(k), i));

export function rangeFor(view: CalView, k: string): { from: string; to: string } {
  if (view === "month") {
    const g = monthGrid(k);
    return { from: g[0][0], to: g[g.length - 1][6] };
  }
  if (view === "week") {
    const w = weekDays(k);
    return { from: w[0], to: w[6] };
  }
  return { from: k, to: k };
}

export function shiftKey(view: CalView, k: string, dir: -1 | 1): string {
  if (view === "day") return addDaysKey(k, dir);
  if (view === "week") return addDaysKey(k, 7 * dir);
  const [y, m] = k.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + dir, 1));
  return toKey(d);
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts });
export function titleFor(view: CalView, k: string): string {
  if (view === "month") return fmt({ month: "long", year: "numeric" }).format(toDate(k));
  if (view === "day") return fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(toDate(k));
  const w = weekDays(k);
  return `${fmt({ day: "numeric", month: "short" }).format(toDate(w[0]))} – ${fmt({ day: "numeric", month: "short", year: "numeric" }).format(toDate(w[6]))}`;
}

export const isValidKey = (k: string | undefined): k is string => Boolean(k && /^\d{4}-\d{2}-\d{2}$/.test(k) && !Number.isNaN(toDate(k).getTime()));

/** Kinds whose date can be changed by dragging on the calendar. */
export const RESCHEDULABLE: CalKind[] = ["task-due", "task-followup", "issue-followup", "uat-target", "milestone", "plan"];

export function groupByDate(events: CalEvent[]): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  for (const e of events) {
    const list = map.get(e.date) ?? [];
    list.push(e);
    map.set(e.date, list);
  }
  return map;
}
