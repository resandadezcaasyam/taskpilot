import fs from "node:fs";
import { applyMigrations, tmp } from "./helpers";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const dbFile = tmp("phase2.db");
/* eslint-disable @typescript-eslint/no-explicit-any */
let T: any, E: any, PL: any, R: any, DP: any, ST: any, D: any, DM: any, ED: any, dbm: any;

const base = {
  description: "", projectId: "", category: "Other", priority: "Medium", status: "To Do", startDate: "", dueDate: "",
  assignee: "", stakeholder: "", estimatedHours: "", actualHours: "", progress: "0", businessImportance: "3", nextAction: "",
  nextActionDue: "", blockerDescription: "", waitingFor: "", followUpDate: "", tags: "", notes: "",
};
const ids: Record<string, string> = {};
const DAY = 86_400_000;

beforeAll(async () => {
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
  applyMigrations(dbFile);
  process.env.DATABASE_URL = `file:${dbFile}`;
  T = await import("../../src/actions/tasks");
  E = await import("../../src/actions/engine");
  PL = await import("../../src/actions/planner");
  R = await import("../../src/actions/reminders");
  DP = await import("../../src/actions/deps");
  ST = await import("../../src/actions/settings");
  D = await import("../../src/lib/dates");
  ED = await import("../../src/lib/engine-data");
  DM = await import("../../src/lib/queries");
  dbm = await import("../../src/lib/db");
});

const today = () => D.dateKey(new Date());
const shift = (n: number) => D.dateKey(D.addDays(D.startOfToday(), n));
async function mk(key: string, over: Record<string, string>) {
  const r = await T.createTask({ ...base, ...over });
  expect(r.ok, JSON.stringify(r)).toBe(true);
  ids[key] = r.data.id;
}
const idOf = (rec: any) => rec.task.id;

describe("Phase 2 against real SQLite", () => {
  it("seeds the four spec scenarios and ranks them with the engine", async () => {
    await mk("A", { title: "UAT Booking Enhancement", status: "In Progress", progress: "75", category: "UAT / QA", priority: "High", dueDate: today() });
    await mk("B", { title: "Inter-island Vendor Compliance", status: "Blocked", blockerDescription: "Backend timestamp not generated", waitingFor: "the engineering team", priority: "High" });
    await mk("C", { title: "HSE Portal Testing", status: "In Review", progress: "95", priority: "High" });
    await mk("D", { title: "Operational Issue", status: "Waiting for Others", waitingFor: "the responsible PIC", category: "Operational Support" });
    await mk("E", { title: "Finished work", status: "Done" });
    await dbm.db.task.update({ where: { id: ids.D }, data: { updatedAt: new Date(Date.now() - 3 * DAY), blockedAt: new Date(Date.now() - 3 * DAY) } });
    await dbm.db.task.update({ where: { id: ids.B }, data: { blockedAt: new Date(Date.now() - 4 * DAY) } });

    const state = await ED.getEngineState();
    const byTask = new Map(state.recommendations.map((r: any) => [idOf(r), r]));
    expect(byTask.has(ids.E)).toBe(false); // done tasks are never recommended
    expect((byTask.get(ids.A) as any).action).toContain("Continue executing the remaining test cases and document the findings.");
    expect((byTask.get(ids.A) as any).kind).toBe("Do Now"); // due today + High priority
    expect((byTask.get(ids.B) as any).action).toContain("Follow up with the engineering team");
    expect((byTask.get(ids.C) as any).action).toContain("ready for sign-off");
    expect((byTask.get(ids.D) as any).action).toBe("Request an investigation update from the responsible PIC.");
    expect(state.recommendations.map((r: any) => r.order)).toEqual([1, 2, 3, 4]);
    const dash = await DM.getDashboardData();
    expect(dash.focus.length).toBe(4);
    expect(dash.focus[0].score).toBeGreaterThanOrEqual(dash.focus[3].score);
  });

  it("completing a next action keeps the task open and records history", async () => {
    const before = (await ED.getEngineState()).recommendations.find((r: any) => idOf(r) === ids.D);
    const r = await E.completeNextAction(ids.D, { kind: before.kind, text: before.action, score: before.score, reason: before.reason });
    expect(r.ok).toBe(true);
    const task = await dbm.db.task.findUniqueOrThrow({ where: { id: ids.D } });
    expect(task.status).toBe("Waiting for Others"); // NOT completed
    const rows = await dbm.db.nextAction.findMany({ where: { taskId: ids.D, status: "Done" } });
    expect(rows).toHaveLength(1);
    expect((await ED.getEngineState()).completed.length).toBe(1);
    const after = (await ED.getEngineState()).recommendations.find((r: any) => idOf(r) === ids.D);
    expect(after.score).toBeLessThan(before.score); // freshly touched, so no longer stale
    const types = (await dbm.db.taskActivity.findMany({ where: { taskId: ids.D } })).map((a: any) => a.type);
    expect(types).toContain("NEXT_ACTION_COMPLETED");
  });

  it("postponed tasks disappear until the date and return automatically", async () => {
    expect((await E.postponeNextAction(ids.C, "tomorrow", { kind: "Review", text: "x", score: 50 })).ok).toBe(true);
    const now = await ED.getEngineState();
    expect(now.recommendations.some((r: any) => idOf(r) === ids.C)).toBe(false);
    expect(now.postponed.map((p: any) => p.task.id)).toContain(ids.C);
    const tomorrow = await ED.getEngineState(new Date(Date.now() + DAY + 60_000));
    expect(tomorrow.recommendations.some((r: any) => idOf(r) === ids.C)).toBe(true);
    expect((await E.cancelPostpone(ids.C)).ok).toBe(true);
    expect((await ED.getEngineState()).recommendations.some((r: any) => idOf(r) === ids.C)).toBe(true);
  });

  it("manual override replaces the text and can pin to the top; removal restores the engine", async () => {
    expect((await E.overrideNextAction(ids.D, { text: "Call Budi directly", pinned: true })).ok).toBe(true);
    let s = await ED.getEngineState();
    expect(s.recommendations[0].task.id).toBe(ids.D);
    expect(s.recommendations[0].action).toBe("Call Budi directly");
    expect(s.recommendations[0].score).toBe(100);
    expect((await E.overrideNextAction(ids.D, { text: "", pinned: false })).ok).toBe(true);
    s = await ED.getEngineState();
    expect(s.recommendations.find((r: any) => idOf(r) === ids.D).source).toBe("engine");
  });

  it("follow-up, update blocker, change PIC, reschedule and resolve", async () => {
    expect((await E.recordFollowUp(ids.B, { note: "Asked for ETA", nextDate: shift(2) })).ok).toBe(true);
    let b = await dbm.db.task.findUniqueOrThrow({ where: { id: ids.B } });
    expect(D.dateKey(b.followUpDate)).toBe(shift(2));
    expect(await dbm.db.taskComment.count({ where: { taskId: ids.B } })).toBe(1);
    expect((await E.updateBlocker(ids.B, "Timestamp still missing in v2")).ok).toBe(true);
    expect((await E.updateBlocker(ids.B, "  ")).ok).toBe(false);
    expect((await E.changePic(ids.B, "Andi")).ok).toBe(true);
    expect((await E.rescheduleFollowUp(ids.B, shift(5))).ok).toBe(true);
    const wb = await ED.getWaitingBlocked();
    expect(wb.rows.map((r: any) => r.task.id).sort()).toEqual([ids.B, ids.D].sort());
    const rowB = wb.rows.find((r: any) => r.task.id === ids.B);
    expect(rowB.task.waitingFor).toBe("Andi");
    expect(rowB.flags).toContain("Blocker unresolved");
    expect(rowB.latest.text).toContain("Follow-up"); // latest update comes from the comment or activity
    expect((await E.resumeTask(ids.B)).ok).toBe(true);
    b = await dbm.db.task.findUniqueOrThrow({ where: { id: ids.B } });
    expect(b.status).toBe("In Progress");
    expect(b.blockerDescription).toBeNull();
    expect((await ED.getWaitingBlocked()).rows.map((r: any) => r.task.id)).toEqual([ids.D]);
  });

  it("Today Planner: plan, reorder, done, log work, reschedule, carry-over, notes", async () => {
    expect((await E.startNow(ids.C)).ok).toBe(true); // In Review stays; plan item added
    expect((await PL.addToPlan(ids.A)).ok).toBe(true);
    expect((await PL.addToPlan(ids.A)).ok).toBe(true); // idempotent
    let plan = await dbm.db.planItem.findMany({ where: { date: today() }, orderBy: { position: "asc" } });
    expect(plan).toHaveLength(2);
    const [first, second] = plan;
    expect((await PL.reorderPlan([second.id, first.id])).ok).toBe(true);
    plan = await dbm.db.planItem.findMany({ where: { date: today() }, orderBy: { position: "asc" } });
    expect(plan.map((p: any) => p.id)).toEqual([second.id, first.id]);

    const itemA = plan.find((p: any) => p.taskId === ids.A);
    expect((await PL.recordWork(itemA.id, { minutes: 45, progress: 90, note: "Ran cases 40-52" })).ok).toBe(true);
    const a = await dbm.db.task.findUniqueOrThrow({ where: { id: ids.A } });
    expect(a.progress).toBe(90);
    expect(a.actualMinutes).toBe(45);
    expect((await PL.recordWork(itemA.id, { minutes: 0, progress: null, note: "" })).ok).toBe(false);

    expect((await PL.setPlanDone(itemA.id, true)).ok).toBe(true);
    expect((await dbm.db.task.findUniqueOrThrow({ where: { id: ids.A } })).status).toBe("In Progress"); // task not completed

    const data = await ED.getPlannerData();
    expect(data.stats).toMatchObject({ total: 2, done: 1 });
    expect(data.sections.followUps.length + data.sections.mustDo.length + data.sections.focus.length).toBeGreaterThan(0);

    // yesterday's unfinished item is preserved and can be pulled into today
    await dbm.db.planItem.create({ data: { date: shift(-1), taskId: ids.D, status: "Planned" } });
    expect((await ED.getPlannerData()).carried.map((c: any) => c.taskId)).toEqual([ids.D]);
    const carried = await dbm.db.planItem.findFirstOrThrow({ where: { taskId: ids.D } });
    expect((await PL.carryToToday(carried.id)).ok).toBe(true);
    expect((await ED.getPlannerData()).carried).toHaveLength(0);
    const moved = await dbm.db.planItem.findFirstOrThrow({ where: { taskId: ids.D } });
    expect((await PL.moveToTomorrow(moved.id)).ok).toBe(true);
    expect((await dbm.db.planItem.findUniqueOrThrow({ where: { id: moved.id } })).date).toBe(shift(1));

    expect((await PL.saveDailyNote(today(), "Tell Budi about the fix")).ok).toBe(true);
    expect((await ED.getPlannerData()).note).toBe("Tell Budi about the fix");
  });

  it("reminders: created, snoozed, dismissed, state persists, recalculated for a new date", async () => {
    await dbm.db.task.update({ where: { id: ids.A }, data: { status: "In Progress", dueDate: D.addDays(D.startOfToday(), -2) } });
    const first = await ED.syncReminders();
    expect(first.changed).toBeGreaterThan(0);
    // many parallel page loads must never create duplicates or throw
    await dbm.db.reminder.deleteMany();
    const results = await Promise.all(Array.from({ length: 8 }, () => ED.syncReminders()));
    expect(results.length).toBe(8);
    const keys = (await dbm.db.reminder.findMany()).map((r: any) => `${r.taskId}:${r.type}`);
    expect(new Set(keys).size).toBe(keys.length);
    const active = await ED.getActiveReminders();
    const overdue = active.find((r: any) => r.type === "OVERDUE" && r.taskId === ids.A);
    expect(overdue.message).toContain("overdue by 2 days");
    expect(ED.reminderBadges(active)["/today"]).toBeGreaterThan(0);

    expect((await R.snoozeReminder(overdue.id, "1h")).ok).toBe(true);
    expect((await ED.getActiveReminders()).some((r: any) => r.id === overdue.id)).toBe(false);
    await ED.syncReminders(); // re-evaluating must not wake a snoozed reminder
    expect((await ED.getActiveReminders()).some((r: any) => r.id === overdue.id)).toBe(false);
    expect((await ED.getActiveReminders(new Date(Date.now() + 2 * 3_600_000))).some((r: any) => r.id === overdue.id)).toBe(true);

    expect((await R.dismissReminder(overdue.id)).ok).toBe(true);
    await ED.syncReminders();
    expect((await ED.getActiveReminders(new Date(Date.now() + 9 * DAY))).some((r: any) => r.id === overdue.id)).toBe(false);

    // completing the task removes its reminders; a later date escalates messages
    await T.completeTask(ids.A);
    await ED.syncReminders();
    expect((await dbm.db.reminder.count({ where: { taskId: ids.A } }))).toBe(0);
    const r2 = await R.refreshReminders();
    expect(r2.ok).toBe(true);
    await ED.syncReminders(new Date(Date.now() + 3 * DAY));
    expect((await dbm.db.reminder.findMany()).some((r: any) => r.type === "INACTIVE_TASK")).toBe(true);
  });

  it("dependencies: add, reject self and cycles, discount the dependent task, remove", async () => {
    expect((await DP.addDependency(ids.C, ids.C)).ok).toBe(false);
    expect((await DP.addDependency(ids.C, ids.D)).ok).toBe(true);
    const cycle = await DP.addDependency(ids.D, ids.C);
    expect(cycle.ok).toBe(false);
    expect(cycle.error).toMatch(/circular/);
    const full = await DM.getTask(ids.C);
    expect(full.dependsOn).toHaveLength(1);
    const rec = (await ED.getEngineState()).recommendations.find((r: any) => idOf(r) === ids.C);
    expect(rec.reason).toContain("Depends on");
    await DP.removeDependency(full.dependsOn[0].id);
    expect((await DM.getTask(ids.C)).dependsOn).toHaveLength(0);
  });

  it("settings persist, validate, and change the ranking", async () => {
    const s = await ED.getSettings();
    expect(s.weights.deadline).toBe(30);
    expect((await ST.saveEngineSettings({ ...s, weights: { deadline: 0, priority: 0, followUp: 0, inactivity: 0, effort: 0 } })).ok).toBe(false);
    expect((await ST.saveEngineSettings({ ...s, weights: { ...s.weights, deadline: 80 }, inactivityDays: 5 })).ok).toBe(true);
    const saved = await ED.getSettings();
    expect(saved.weights.deadline).toBe(80);
    expect(saved.inactivityDays).toBe(5);
    expect((await ST.resetEngineSettings()).ok).toBe(true);
    expect((await ED.getSettings()).weights.deadline).toBe(30);
  });

  it("everything survives a brand-new database connection", async () => {
    await ST.saveEngineSettings({ ...(await ED.getSettings()), workdayHours: 5 });
    const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
    const { PrismaClient } = await import("../../src/generated/prisma/client");
    const fresh = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${dbFile}` }) });
    const out = {
      plan: await fresh.planItem.count(),
      notes: (await fresh.dailyNote.findFirst())?.note,
      nextActions: await fresh.nextAction.count(),
      reminders: await fresh.reminder.count(),
      settings: JSON.parse((await fresh.userPreference.findUnique({ where: { key: "settings.engine" } }))!.value).workdayHours,
    };
    await fresh.$disconnect();
    expect(out.plan).toBeGreaterThan(0);
    expect(out.notes).toBe("Tell Budi about the fix");
    expect(out.nextActions).toBeGreaterThan(0);
    expect(out.reminders).toBeGreaterThan(0);
    expect(out.settings).toBe(5);
  });
});
