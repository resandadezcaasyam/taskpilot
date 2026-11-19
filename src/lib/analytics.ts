/**
 * Analytics calculations (pure). Definitions, all in the app timezone:
 *  - Created / Completed: tasks whose createdAt / completedAt falls inside the selected range.
 *  - Completion rate: of the tasks CREATED in the range (cancelled excluded), the share that is Done now.
 *  - Average completion time: mean days from creation to completion, for tasks completed in the range.
 *  - Overdue: open tasks past their deadline right now (not range dependent).
 *  - Distributions (status, priority, category, project): tasks created in the range.
 *  - Blocker duration: time between "blocker added" and "blocker resolved" events resolved in the range.
 */
import { addDaysKey, startOfWeekKey, toKey } from "./calendar";
import { dateKey, daysFromToday } from "./dates";

export interface AnalyticsTask {
  id: string;
  status: string;
  priority: string;
  category: string;
  projectId: string | null;
  dueDate: Date | null;
  createdAt: Date;
  completedAt: Date | null;
}
export interface Range { from: string; to: string }
export type RangeKey = "7d" | "30d" | "90d" | "year" | "all" | "custom";

const isKey = (k?: string): k is string => Boolean(k && /^\d{4}-\d{2}-\d{2}$/.test(k) && !Number.isNaN(new Date(`${k}T00:00:00Z`).getTime()));
const within = (d: Date | null, r: Range) => {
  if (!d) return false;
  const k = dateKey(d);
  return k >= r.from && k <= r.to;
};

export function resolveRange(p: { range?: string; from?: string; to?: string }, todayKey: string, earliestKey?: string | null): Range & { range: RangeKey } {
  if (isKey(p.from) && isKey(p.to) && p.from <= p.to) return { range: "custom", from: p.from, to: p.to };
  const r = p.range;
  if (r === "7d") return { range: "7d", from: addDaysKey(todayKey, -6), to: todayKey };
  if (r === "90d") return { range: "90d", from: addDaysKey(todayKey, -89), to: todayKey };
  if (r === "year") return { range: "year", from: `${todayKey.slice(0, 4)}-01-01`, to: todayKey };
  if (r === "all") return { range: "all", from: earliestKey && earliestKey <= todayKey ? earliestKey : addDaysKey(todayKey, -29), to: todayKey };
  return { range: "30d", from: addDaysKey(todayKey, -29), to: todayKey };
}

export function summarize(tasks: AnalyticsTask[], r: Range, now: Date) {
  const created = tasks.filter((t) => within(t.createdAt, r));
  const completed = tasks.filter((t) => t.status === "Done" && within(t.completedAt, r));
  const cohort = created.filter((t) => t.status !== "Cancelled");
  const doneInCohort = cohort.filter((t) => t.status === "Done").length;
  const durations = completed.filter((t) => t.completedAt).map((t) => ((t.completedAt as Date).getTime() - t.createdAt.getTime()) / 86_400_000);
  const open = tasks.filter((t) => t.status !== "Done" && t.status !== "Cancelled");
  return {
    totalCreated: created.length,
    totalCompleted: completed.length,
    completionRate: cohort.length ? Math.round((doneInCohort / cohort.length) * 100) : null,
    overdue: open.filter((t) => t.dueDate && daysFromToday(t.dueDate, now) < 0).length,
    avgCompletionDays: durations.length ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 : null,
    open: open.length,
  };
}

export function createdInRange(tasks: AnalyticsTask[], r: Range) {
  return tasks.filter((t) => within(t.createdAt, r));
}

export function distribution<T>(items: T[], key: (t: T) => string, order?: readonly string[]): { name: string; value: number }[] {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  const rows = [...m.entries()].map(([name, value]) => ({ name, value }));
  if (order) rows.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  else rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  return rows;
}

const label = (k: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o }).format(new Date(`${k}T00:00:00Z`));
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000) + 1;

function buckets(r: Range, g: "day" | "week" | "month") {
  const keys: string[] = [];
  const n = daysBetween(r.from, r.to);
  for (let i = 0; i < n; i++) {
    const d = addDaysKey(r.from, i);
    const k = g === "day" ? d : g === "week" ? startOfWeekKey(d) : d.slice(0, 7);
    if (keys[keys.length - 1] !== k) keys.push(k);
  }
  return keys;
}
const bucketOf = (k: string, g: "day" | "week" | "month") => (g === "day" ? k : g === "week" ? startOfWeekKey(k) : k.slice(0, 7));
const bucketLabel = (k: string, g: "day" | "week" | "month") =>
  g === "month" ? label(`${k}-01`, { month: "short", year: "2-digit" }) : label(k, { day: "numeric", month: "short" });

export function series(tasks: AnalyticsTask[], r: Range, g: "day" | "week" | "month") {
  const pts = new Map(buckets(r, g).map((k) => [k, { key: k, label: bucketLabel(k, g), created: 0, completed: 0 }]));
  for (const t of tasks) {
    if (within(t.createdAt, r)) {
      const p = pts.get(bucketOf(dateKey(t.createdAt), g));
      if (p) p.created++;
    }
    if (t.status === "Done" && within(t.completedAt, r)) {
      const p = pts.get(bucketOf(dateKey(t.completedAt as Date), g));
      if (p) p.completed++;
    }
  }
  return [...pts.values()];
}

/** Daily for short ranges, weekly for medium ones, monthly for long ones. */
export function trendSeries(tasks: AnalyticsTask[], r: Range) {
  const days = daysBetween(r.from, r.to);
  const granularity = days <= 45 ? "day" : days <= 200 ? "week" : "month";
  return { granularity, points: series(tasks, r, granularity) } as const;
}

export interface BlockerEvent { taskId: string | null; type: string; createdAt: Date }

export function blockerStats(events: BlockerEvent[], r: Range, now: Date) {
  const byTask = new Map<string, BlockerEvent[]>();
  for (const e of events) {
    if (!e.taskId) continue;
    byTask.set(e.taskId, [...(byTask.get(e.taskId) ?? []), e]);
  }
  const resolved: number[] = [];
  let ongoing = 0;
  let longestOngoing = 0;
  for (const list of byTask.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let openSince: Date | null = null;
    for (const e of list) {
      if (e.type === "BLOCKER_ADDED") openSince = openSince ?? e.createdAt;
      else if (e.type === "BLOCKER_RESOLVED" && openSince) {
        if (within(e.createdAt, r)) resolved.push((e.createdAt.getTime() - openSince.getTime()) / 86_400_000);
        openSince = null;
      }
    }
    if (openSince) {
      ongoing++;
      longestOngoing = Math.max(longestOngoing, Math.floor((now.getTime() - openSince.getTime()) / 86_400_000));
    }
  }
  return {
    avgDays: resolved.length ? Math.round((resolved.reduce((a, b) => a + b, 0) / resolved.length) * 10) / 10 : null,
    resolvedCount: resolved.length,
    ongoingCount: ongoing,
    longestOngoingDays: longestOngoing,
  };
}

export const todayKeyOf = (now: Date) => toKey(new Date(`${dateKey(now)}T00:00:00Z`));
