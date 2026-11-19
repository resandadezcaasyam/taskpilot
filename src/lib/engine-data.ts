import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { CLOSED_STATUSES } from "./constants";
import { addDays, dateKey, daysFromToday, daysSince, startOfToday } from "./dates";
import { effectiveDays, rankAll, recommend, type EngineTask, type Override, type Recommendation } from "./engine";
import { buildSections, plannedMinutes } from "./planner";
import { issueCode } from "./issues";
import { computeIssueReminders, computeReminders, computeUatReminders, reminderSeverity } from "./reminders-calc";
import { DEFAULT_SETTINGS, mergeSettings, type EngineSettings } from "./settings";

export const SETTINGS_KEY = "settings.engine";

export async function getSettings(): Promise<EngineSettings> {
  const pref = await db.userPreference.findUnique({ where: { key: SETTINGS_KEY } });
  if (!pref) return structuredClone(DEFAULT_SETTINGS);
  try {
    return mergeSettings(JSON.parse(pref.value));
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export const engineInclude = {
  project: { select: { name: true } },
  dependsOn: { include: { dependsOn: { select: { id: true, title: true, status: true, dueDate: true } } } },
} satisfies Prisma.TaskInclude;
type Loaded = Prisma.TaskGetPayload<{ include: typeof engineInclude }>;

export function toEngineTask(t: Loaded): EngineTask {
  return {
    id: t.id, seq: t.seq, title: t.title, status: t.status, priority: t.priority, category: t.category,
    progress: t.progress, dueDate: t.dueDate, followUpDate: t.followUpDate, updatedAt: t.updatedAt,
    blockedAt: t.blockedAt, blockerDescription: t.blockerDescription, waitingFor: t.waitingFor,
    estimatedMinutes: t.estimatedMinutes, businessImportance: t.businessImportance, nextAction: t.nextAction,
    nextActionDue: t.nextActionDue, projectName: t.project?.name ?? null,
    dependencies: t.dependsOn.map((d) => d.dependsOn),
  };
}

async function loadOverrides(): Promise<Map<string, Override>> {
  const rows = await db.nextAction.findMany({ where: { status: "Override" }, orderBy: { createdAt: "asc" } });
  return new Map(rows.map((r) => [r.taskId, { text: r.text, pinned: r.pinned }]));
}

/** Everything the Next Actions page, the dashboard and the planner need, recalculated for `now`. */
export async function getEngineState(now = new Date()) {
  const [settings, tasks, overrides, postponedRows, completed] = await Promise.all([
    getSettings(),
    db.task.findMany({ where: { status: { notIn: [...CLOSED_STATUSES] } }, include: engineInclude }),
    loadOverrides(),
    db.nextAction.findMany({ where: { status: "Postponed", postponedTo: { gt: now } } }),
    db.nextAction.findMany({
      where: { status: "Done" },
      orderBy: { completedAt: "desc" },
      take: 8,
      include: { task: { select: { id: true, seq: true, title: true } } },
    }),
  ]);
  const postponedUntil = new Map<string, Date>();
  for (const p of postponedRows) if (p.postponedTo) postponedUntil.set(p.taskId, p.postponedTo);
  const ranked = rankAll(tasks.map(toEngineTask), settings, now, overrides, postponedUntil);
  return { settings, ...ranked, overrides, completed };
}

export async function getPlannerData(now = new Date()) {
  const today = dateKey(now);
  const state = await getEngineState(now);
  const sections = buildSections(state.recommendations, state.settings, now);
  const recById = new Map<string, Recommendation>(state.recommendations.map((r) => [r.task.id, r]));

  const [items, carried, note] = await Promise.all([
    db.planItem.findMany({
      where: { date: today, status: { not: "Dropped" } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: { task: { include: engineInclude } },
    }),
    db.planItem.findMany({
      where: { date: { lt: today }, status: "Planned", task: { status: { notIn: [...CLOSED_STATUSES] } } },
      orderBy: { date: "desc" },
      include: { task: { select: { id: true, seq: true, title: true, status: true, priority: true } } },
    }),
    db.dailyNote.findUnique({ where: { date: today } }),
  ]);

  const planned = items.map((item) => {
    const et = toEngineTask(item.task);
    const rec = recById.get(item.taskId) ?? recommend(et, state.settings, now, state.overrides.get(item.taskId));
    return { item, task: et, rec };
  });
  const open = planned.filter((p) => p.item.status !== "Done");
  const stats = {
    total: planned.length,
    done: planned.length - open.length,
    remainingMinutes: open.reduce((sum, p) => sum + (p.rec ? plannedMinutes(p.rec) : 30), 0),
    capacityMinutes: Math.round(state.settings.workdayHours * 60),
  };
  // carried-over items already planned for today are not shown twice
  const todayTaskIds = new Set(items.map((i) => i.taskId));
  return {
    today, settings: state.settings, sections, planned, stats, postponedCount: state.postponed.length,
    carried: carried.filter((c) => !todayTaskIds.has(c.taskId)),
    note: note?.note ?? "",
    inPlan: todayTaskIds,
  };
}

export async function getWaitingBlocked(now = new Date()) {
  const [settings, overrides, tasks] = await Promise.all([
    getSettings(),
    loadOverrides(),
    db.task.findMany({
      where: { status: { in: ["Blocked", "Waiting for Others"] } },
      include: {
        ...engineInclude,
        comments: { orderBy: { createdAt: "desc" }, take: 1 },
        activities: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
  ]);
  const rows = tasks.map((t) => {
    const et = toEngineTask(t);
    const rec = recommend(et, settings, now, overrides.get(t.id))!;
    const idle = Math.max(0, daysSince(t.updatedAt, now));
    const d = effectiveDays(et, now);
    const fu = t.followUpDate ? daysFromToday(t.followUpDate, now) : null;
    const flags: string[] = [];
    if (fu !== null && fu <= 0) flags.push(fu < 0 ? `Follow-up ${-fu}d late` : "Follow-up due today");
    if (idle >= settings.inactivityDays) flags.push(`Inactive ${idle}d`);
    if (t.status === "Blocked") flags.push("Blocker unresolved");
    if (d !== null && d <= settings.deadlineLeadDays) flags.push(d < 0 ? `Overdue ${-d}d` : d === 0 ? "Due today" : `Due in ${d}d`);
    if (et.dependencies.some((x) => !CLOSED_STATUSES.includes(x.status as never) && x.dueDate && daysFromToday(x.dueDate, now) < 0)) {
      flags.push("Dependency overdue");
    }
    const comment = t.comments[0];
    const activity = t.activities[0];
    const latest =
      comment && (!activity || comment.createdAt >= activity.createdAt)
        ? { text: comment.body, at: comment.createdAt }
        : activity
          ? { text: activity.message, at: activity.createdAt }
          : null;
    return {
      task: et, rec, flags, latest,
      daysWaiting: Math.max(0, daysSince(t.blockedAt ?? t.updatedAt, now)),
      project: t.project ? { name: t.project.name } : null,
      assignee: t.assignee,
    };
  });
  rows.sort((a, b) => b.rec.score - a.rec.score);
  return { rows, settings };
}

// ---------------- reminders ----------------

type ReminderColumn = "taskId" | "issueId" | "uatFeatureId";
interface Wanted {
  col: ReminderColumn;
  id: string;
  type: string;
  message: string;
  dueAt: Date;
}

/**
 * Re-evaluates which reminders should exist (tasks, UAT target dates, issue follow-ups).
 * Snooze/dismiss state of surviving reminders is kept. Calls are serialised in-process and
 * existing rows are read INSIDE the transaction, so parallel page loads never create duplicates.
 */
let syncQueue: Promise<unknown> = Promise.resolve();
export function syncReminders(now = new Date()): Promise<{ changed: number }> {
  const run = syncQueue.then(() => doSyncReminders(now));
  syncQueue = run.catch(() => undefined);
  return run;
}

async function doSyncReminders(now: Date): Promise<{ changed: number }> {
  const settings = await getSettings();
  const [tasks, features, issues] = await Promise.all([
    db.task.findMany({
      where: { status: { notIn: [...CLOSED_STATUSES] } },
      select: { id: true, title: true, status: true, dueDate: true, followUpDate: true, updatedAt: true, blockedAt: true },
    }),
    db.uatFeature.findMany({
      where: { status: { not: "Completed" }, signOffStatus: { not: "Signed Off" } },
      select: { id: true, name: true, status: true, signOffStatus: true, targetDate: true },
    }),
    db.issue.findMany({
      where: { status: { notIn: ["Resolved", "Closed"] } },
      select: { id: true, seq: true, title: true, status: true, nextFollowUpDate: true, expectedResolution: true },
    }),
  ]);

  const wanted: Wanted[] = [
    ...computeReminders(tasks, settings, now).map((w) => ({ col: "taskId" as const, id: w.taskId, type: w.type, message: w.message, dueAt: w.dueAt })),
    ...computeUatReminders(features, settings, now).map((w) => ({ col: "uatFeatureId" as const, id: w.entityId, type: w.type, message: w.message, dueAt: w.dueAt })),
    ...computeIssueReminders(issues.map((i) => ({ ...i, code: issueCode(i.seq) })), now).map((w) => ({ col: "issueId" as const, id: w.entityId, type: w.type, message: w.message, dueAt: w.dueAt })),
  ];
  const key = (col: ReminderColumn, id: string, type: string) => `${col}:${id}:${type}`;
  const wantedKeys = new Set(wanted.map((w) => key(w.col, w.id, w.type)));

  return db.$transaction(async (tx) => {
    const existing = await tx.reminder.findMany();
    const colOf = (r: (typeof existing)[number]): ReminderColumn => (r.taskId ? "taskId" : r.issueId ? "issueId" : "uatFeatureId");
    const idOf = (r: (typeof existing)[number]) => r.taskId ?? r.issueId ?? r.uatFeatureId ?? "";
    const have = new Map(existing.map((r) => [key(colOf(r), idOf(r), r.type), r]));
    let changed = 0;
    for (const w of wanted) {
      const cur = have.get(key(w.col, w.id, w.type));
      if (!cur) {
        const where =
          w.col === "taskId" ? { taskId_type: { taskId: w.id, type: w.type } }
          : w.col === "issueId" ? { issueId_type: { issueId: w.id, type: w.type } }
          : { uatFeatureId_type: { uatFeatureId: w.id, type: w.type } };
        await tx.reminder.upsert({
          where,
          create: { [w.col]: w.id, type: w.type, message: w.message, dueAt: w.dueAt },
          update: { message: w.message, dueAt: w.dueAt },
        });
        changed++;
      } else if (cur.message !== w.message || cur.dueAt.getTime() !== w.dueAt.getTime()) {
        await tx.reminder.update({ where: { id: cur.id }, data: { message: w.message, dueAt: w.dueAt } });
      }
    }
    for (const r of existing) {
      if (!wantedKeys.has(key(colOf(r), idOf(r), r.type))) {
        await tx.reminder.delete({ where: { id: r.id } });
        changed++;
      }
    }
    return { changed };
  });
}

export async function getActiveReminders(now = new Date()) {
  const rows = await db.reminder.findMany({
    where: { dismissedAt: null, OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] },
    include: {
      task: { select: { id: true, seq: true, title: true } },
      issue: { select: { id: true, seq: true, title: true } },
      uatFeature: { select: { id: true, name: true } },
    },
  });
  return rows
    .map((r) => ({
      ...r,
      entity: (r.taskId ? "task" : r.issueId ? "issue" : "uat") as "task" | "issue" | "uat",
      href: r.task ? `/tasks/${r.task.id}` : r.issue ? `/issues/${r.issue.id}` : r.uatFeature ? `/uat/${r.uatFeature.id}` : "/",
    }))
    .sort((a, b) => reminderSeverity(a.type) - reminderSeverity(b.type) || a.dueAt.getTime() - b.dueAt.getTime());
}
export type ActiveReminder = Awaited<ReturnType<typeof getActiveReminders>>[number];

export function toReminderItem(r: ActiveReminder) {
  return { id: r.id, type: r.type, message: r.message, href: r.href };
}

export function reminderBadges(reminders: { type: string; entity: string }[]): Record<string, number> {
  const n = (entity: string, types?: string[]) => reminders.filter((r) => r.entity === entity && (!types || types.includes(r.type))).length;
  return {
    "/today": n("task", ["OVERDUE", "DEADLINE_APPROACHING"]),
    "/waiting": n("task", ["FOLLOW_UP_DUE", "UNRESOLVED_BLOCKER", "INACTIVE_TASK"]),
    "/uat": n("uat"),
    "/issues": n("issue"),
  };
}

export const tomorrowStart = (now = new Date()) => addDays(startOfToday(now), 1);
