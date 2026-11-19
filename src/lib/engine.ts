/**
 * SMART NEXT ACTION ENGINE (pure functions, no database access).
 *
 * Priority score (0-100) = weighted average of five normalised components (each 0-1):
 *   deadline   (default 30%)  overdue = 1, today .95, tomorrow .85 ... no deadline .1
 *   priority   (default 25%)  70% task priority + 30% business importance (1-5)
 *   follow-up  (default 20%)  blocked (grows over a week), waiting + follow-up due / stale,
 *                             follow-up date reached, in review, dependencies
 *   inactivity (default 15%)  days since last update, reaching 1 at 2x the inactivity threshold
 *   effort     (default 10%)  quick tasks score higher (<=15 min = 1 ... unknown = .4)
 * Weights are normalised, then multiplied by adjustments: fresh waiting tasks x0.55,
 * backlog x0.6, tasks with an unfinished dependency x0.7. A pinned override is always 100.
 * Done and Cancelled tasks are never recommended.
 */
import { daysFromToday, daysSince, formatDate } from "./dates";
import type { EngineSettings } from "./settings";
import { formatMinutes } from "./utils";

export const REC_KINDS = [
  "Do Now",
  "Do Today",
  "Follow Up",
  "Resolve Blocker",
  "Continue Progress",
  "Review",
  "Approaching Deadline",
  "Quick Win",
] as const;
export type RecKind = (typeof REC_KINDS)[number];

export interface EngineTask {
  id: string;
  seq: number;
  title: string;
  status: string;
  priority: string;
  category: string;
  progress: number;
  dueDate: Date | null;
  followUpDate: Date | null;
  updatedAt: Date;
  blockedAt: Date | null;
  blockerDescription: string | null;
  waitingFor: string | null;
  estimatedMinutes: number | null;
  businessImportance: number;
  nextAction: string | null;
  nextActionDue: Date | null;
  projectName?: string | null;
  dependencies: { id: string; title: string; status: string; dueDate: Date | null }[];
}

export interface ScoreBreakdown {
  deadline: number;
  priority: number;
  followUp: number;
  inactivity: number;
  effort: number;
}

export interface Override {
  text: string;
  pinned: boolean;
}

export interface Recommendation {
  task: EngineTask;
  kind: RecKind;
  action: string;
  reason: string;
  score: number;
  breakdown: ScoreBreakdown; // each 0-100
  remainingMinutes: number | null;
  durationMinutes: number | null;
  needsFollowUp: boolean;
  source: "engine" | "override";
  pinned: boolean;
  order: number;
}

export const isOpenStatus = (s: string) => s !== "Done" && s !== "Cancelled";
const isHolding = (s: string) => s === "Blocked" || s === "Waiting for Others";
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function remainingMinutes(t: Pick<EngineTask, "estimatedMinutes" | "progress">): number | null {
  if (!t.estimatedMinutes) return null;
  return Math.max(5, Math.round(t.estimatedMinutes * (1 - t.progress / 100)));
}

/** Days until the earliest of the deadline and the next-action deadline (negative = overdue). */
export function effectiveDays(t: Pick<EngineTask, "dueDate" | "nextActionDue">, now: Date): number | null {
  const dates = [t.dueDate, t.nextActionDue].filter((d): d is Date => Boolean(d));
  if (dates.length === 0) return null;
  return Math.min(...dates.map((d) => daysFromToday(d, now)));
}

function deadlineScore(d: number | null): number {
  if (d === null) return 0.1;
  if (d < 0) return 1;
  if (d === 0) return 0.95;
  if (d === 1) return 0.85;
  if (d === 2) return 0.75;
  if (d === 3) return 0.65;
  if (d <= 5) return 0.5;
  if (d <= 7) return 0.4;
  if (d <= 14) return 0.2;
  return 0.08;
}

const PRIORITY_SCORE: Record<string, number> = { Critical: 1, High: 0.75, Medium: 0.45, Low: 0.15 };

function effortScore(rem: number | null): number {
  if (rem === null) return 0.4;
  if (rem <= 15) return 1;
  if (rem <= 30) return 0.85;
  if (rem <= 60) return 0.65;
  if (rem <= 120) return 0.45;
  if (rem <= 240) return 0.25;
  return 0.1;
}

interface Analysis {
  c: Record<keyof ScoreBreakdown, number>;
  d: number | null;
  followUpDue: boolean;
  followUpDaysLate: number;
  stale: boolean;
  idleDays: number;
  blockedDays: number;
  openDeps: EngineTask["dependencies"];
  depOverdue: boolean;
  reasons: string[];
}

function analyse(t: EngineTask, s: EngineSettings, now: Date): Analysis {
  const reasons: string[] = [];
  const d = effectiveDays(t, now);
  const idleDays = Math.max(0, daysSince(t.updatedAt, now));
  const stale = t.status !== "Backlog" && idleDays >= s.inactivityDays;
  const fu = t.followUpDate ? daysFromToday(t.followUpDate, now) : null;
  const followUpDue = fu !== null && fu <= 0;
  const followUpDaysLate = followUpDue ? -(fu as number) : 0;
  const blockedDays = t.blockedAt ? Math.max(0, daysSince(t.blockedAt, now)) : 0;
  const openDeps = t.dependencies.filter((x) => isOpenStatus(x.status));
  const depOverdue = openDeps.some((x) => x.dueDate && daysFromToday(x.dueDate, now) < 0);

  // follow-up / blocker urgency
  let follow = 0;
  if (t.status === "Blocked") follow = Math.max(follow, Math.min(1, 0.6 + (0.4 * Math.min(blockedDays, 7)) / 7));
  if (t.status === "Waiting for Others") {
    if (followUpDue) follow = Math.max(follow, Math.min(1, 0.8 + 0.05 * followUpDaysLate));
    else if (stale) follow = Math.max(follow, 0.7);
    else follow = Math.max(follow, 0.15);
  } else if (followUpDue) {
    follow = Math.max(follow, Math.min(1, 0.8 + 0.05 * followUpDaysLate));
  }
  if (t.status === "In Review") follow = Math.max(follow, 0.4);
  if (depOverdue) follow = Math.max(follow, 0.8);
  else if (openDeps.length > 0) follow = Math.max(follow, 0.3);

  const prio = 0.7 * (PRIORITY_SCORE[t.priority] ?? 0.45) + 0.3 * ((t.businessImportance - 1) / 4);
  const inactivity = t.status === "Backlog" ? 0 : clamp01(idleDays / (s.inactivityDays * 2));

  // human-readable reasons, most urgent first
  if (d !== null && d < 0) reasons.push(`Overdue by ${-d} ${-d === 1 ? "day" : "days"}`);
  else if (d === 0) reasons.push("Due today");
  else if (d !== null && d <= 7) reasons.push(`Due in ${d} ${d === 1 ? "day" : "days"}`);
  if (t.priority === "Critical" || t.priority === "High") reasons.push(`${t.priority} priority`);
  else if (t.businessImportance >= 4) reasons.push("High business importance");
  if (t.status === "Blocked") reasons.push(blockedDays > 0 ? `Blocked for ${blockedDays} ${blockedDays === 1 ? "day" : "days"}` : "Blocked");
  if (t.status === "Waiting for Others") reasons.push(`Waiting on ${t.waitingFor || "someone"}${t.blockedAt ? ` for ${blockedDays}d` : ""}`);
  if (followUpDue) reasons.push("Follow-up date reached");
  if (stale) reasons.push(`No update for ${idleDays} days`);
  if (depOverdue) reasons.push(`Depends on an overdue task (${openDeps.find((x) => x.dueDate && daysFromToday(x.dueDate, now) < 0)?.title})`);
  else if (openDeps.length) reasons.push(`Depends on ${openDeps.length} unfinished ${openDeps.length === 1 ? "task" : "tasks"}`);
  const rem = remainingMinutes(t);
  if (rem !== null && rem <= s.quickWinMinutes) reasons.push(`Quick to finish (~${formatMinutes(rem)})`);

  return {
    c: { deadline: deadlineScore(d), priority: prio, followUp: follow, inactivity, effort: effortScore(rem) },
    d, followUpDue, followUpDaysLate, stale, idleDays, blockedDays, openDeps, depOverdue, reasons,
  };
}

function pickKind(t: EngineTask, a: Analysis, score: number, s: EngineSettings): RecKind {
  const rem = remainingMinutes(t);
  if (t.status === "Blocked" || a.depOverdue) return "Resolve Blocker";
  if (t.status === "Waiting for Others") return "Follow Up";
  if (t.status === "In Review") return "Review";
  if (a.d !== null && a.d < 0) return "Do Now";
  if (a.followUpDue) return "Follow Up";
  if (a.d === 0) return t.priority === "Critical" || t.priority === "High" ? "Do Now" : "Do Today";
  if (a.d !== null && a.d <= 2) return "Approaching Deadline";
  if (rem !== null && rem <= s.quickWinMinutes) return "Quick Win";
  if (t.status === "In Progress") return "Continue Progress";
  if (t.status === "Backlog") return "Review";
  return score >= 50 ? "Do Today" : "Review";
}

const INVESTIGATION = ["Bug Investigation", "Issue Escalation", "Operational Support"];
const trim = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function suggestAction(t: EngineTask, kind: RecKind, a: Analysis): string {
  const workable = !isHolding(t.status) && t.status !== "In Review";
  if (workable && t.nextAction?.trim() && !a.depOverdue) return t.nextAction.trim();

  if (a.depOverdue) {
    const dep = a.openDeps.find((x) => x.dueDate && daysFromToday(x.dueDate) < 0);
    return `Unblock this by chasing "${dep?.title}", which is overdue and must finish first.`;
  }
  // A task that is already under way is continued, not "started", however urgent it is.
  if (t.status === "In Progress" && (kind === "Do Now" || kind === "Do Today" || kind === "Approaching Deadline")) {
    const keepGoing =
      t.category === "UAT / QA"
        ? "Continue executing the remaining test cases and document the findings."
        : `Continue the remaining work (${100 - t.progress}% left).`;
    if (a.d !== null && a.d < 0) return `${keepGoing} It is already past its deadline.`;
    if (a.d === 0) return `${keepGoing} It is due today.`;
    return keepGoing;
  }
  switch (kind) {
    case "Resolve Blocker": {
      const owner = t.waitingFor?.trim() || "the responsible team";
      return t.blockerDescription
        ? `Follow up with ${owner} regarding "${trim(t.blockerDescription)}" and request an estimated fix date.`
        : `Find out what is blocking this task and follow up with ${owner}.`;
    }
    case "Follow Up": {
      const who = t.waitingFor?.trim() || "the responsible PIC";
      if (t.status === "Waiting for Others") {
        if (a.followUpDue || a.stale) {
          return INVESTIGATION.includes(t.category)
            ? `Request an investigation update from ${who}.`
            : `Request a status update from ${who}.`;
        }
        return `Waiting on ${who}. Check back${t.followUpDate ? ` on ${formatDate(t.followUpDate)}` : " and set a follow-up date"}.`;
      }
      return `Follow up on this task (follow-up date ${formatDate(t.followUpDate)}).`;
    }
    case "Review":
      if (t.status === "In Review") {
        return t.progress >= 90
          ? "Retest the remaining issue and confirm whether the feature is ready for sign-off."
          : "Finish the review and record your findings.";
      }
      return "Decide when to start this task, or keep it in the backlog.";
    case "Continue Progress":
      return t.category === "UAT / QA"
        ? "Continue executing the remaining test cases and document the findings."
        : `Continue the remaining work (${100 - t.progress}% left).`;
    case "Approaching Deadline":
      return `Check that this is on track for ${formatDate(t.dueDate)} and finish what is left.`;
    case "Quick Win":
      return "Finish this small task now and clear it from your list.";
    case "Do Now":
      return a.d !== null && a.d < 0 ? "Start this now: it is already past its deadline." : "Start this now: it is due today.";
    case "Do Today":
      return "Start working on this today.";
  }
}

function durationFor(kind: RecKind, rem: number | null): number | null {
  if (kind === "Follow Up") return 10;
  if (kind === "Resolve Blocker") return 15;
  if (kind === "Review") return rem ?? 20;
  if (kind === "Quick Win") return rem ?? 15;
  return rem;
}

export function recommend(t: EngineTask, s: EngineSettings, now: Date, override?: Override): Recommendation | null {
  if (!isOpenStatus(t.status)) return null;
  const a = analyse(t, s, now);
  const w = s.weights;
  const total = w.deadline + w.priority + w.followUp + w.inactivity + w.effort || 1;
  let raw = (w.deadline * a.c.deadline + w.priority * a.c.priority + w.followUp * a.c.followUp + w.inactivity * a.c.inactivity + w.effort * a.c.effort) / total;
  if (t.status === "Waiting for Others" && !a.followUpDue && !a.stale) raw *= 0.55;
  if (t.status === "Backlog") raw *= 0.6;
  if (a.openDeps.length > 0 && t.status !== "Blocked") raw *= 0.7;
  const pinned = Boolean(override?.pinned);
  const score = pinned ? 100 : Math.min(100, Math.max(0, Math.round(raw * 100)));
  const kind = pickKind(t, a, score, s);
  const rem = remainingMinutes(t);
  const reasons = pinned ? ["Pinned by you", ...a.reasons] : a.reasons;
  return {
    task: t,
    kind,
    action: override?.text.trim() ? override.text.trim() : suggestAction(t, kind, a),
    reason: reasons.length ? reasons.join(" · ") : "Next in line",
    score,
    breakdown: {
      deadline: Math.round(a.c.deadline * 100),
      priority: Math.round(a.c.priority * 100),
      followUp: Math.round(a.c.followUp * 100),
      inactivity: Math.round(a.c.inactivity * 100),
      effort: Math.round(a.c.effort * 100),
    },
    remainingMinutes: rem,
    durationMinutes: durationFor(kind, rem),
    needsFollowUp:
      t.status === "Blocked" || a.depOverdue || a.followUpDue || (t.status === "Waiting for Others" && a.stale),
    source: override?.text.trim() ? "override" : "engine",
    pinned,
    order: 0,
  };
}

export interface RankResult {
  recommendations: Recommendation[];
  postponed: { task: EngineTask; until: Date }[];
}

export function rankAll(
  tasks: EngineTask[],
  s: EngineSettings,
  now: Date,
  overrides: Map<string, Override> = new Map(),
  postponedUntil: Map<string, Date> = new Map(),
): RankResult {
  const recs: Recommendation[] = [];
  const postponed: RankResult["postponed"] = [];
  for (const t of tasks) {
    if (!isOpenStatus(t.status)) continue;
    const until = postponedUntil.get(t.id);
    if (until && until.getTime() > now.getTime() && !overrides.get(t.id)?.pinned) {
      postponed.push({ task: t, until });
      continue;
    }
    const r = recommend(t, s, now, overrides.get(t.id));
    if (r) recs.push(r);
  }
  const far = Number.MAX_SAFE_INTEGER;
  recs.sort(
    (a, b) =>
      b.score - a.score ||
      (effectiveDays(a.task, now) ?? far) - (effectiveDays(b.task, now) ?? far) ||
      a.task.seq - b.task.seq,
  );
  recs.forEach((r, i) => (r.order = i + 1));
  return { recommendations: recs, postponed };
}
