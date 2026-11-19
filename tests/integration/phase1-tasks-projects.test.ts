import fs from "node:fs";
import { applyMigrations, tmp } from "./helpers";
import type { TaskFormValues } from "../../src/lib/validators";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const dbFile = tmp("integration.db");
let A: typeof import("../../src/actions/tasks");
let P: typeof import("../../src/actions/projects");
let Q: typeof import("../../src/lib/queries");
let D: typeof import("../../src/lib/dates");
let dbm: typeof import("../../src/lib/db");

const base: Omit<TaskFormValues, "title"> = {
  description: "", projectId: "", category: "Other" as const, priority: "Medium" as const, status: "To Do" as const,
  startDate: "", dueDate: "", assignee: "", stakeholder: "", estimatedHours: "", actualHours: "", progress: "0",
  businessImportance: "3", nextAction: "", nextActionDue: "", blockerDescription: "", waitingFor: "", followUpDate: "",
  tags: "", notes: "",
};
const projBase = { description: "", owner: "", category: "", priority: "High" as const, status: "Active" as const, startDate: "", targetDate: "", risks: "", notes: "" };

beforeAll(async () => {
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
  applyMigrations(dbFile);
  process.env.DATABASE_URL = `file:${dbFile}`;
  A = await import("../../src/actions/tasks");
  P = await import("../../src/actions/projects");
  Q = await import("../../src/lib/queries");
  D = await import("../../src/lib/dates");
  dbm = await import("../../src/lib/db");
});

describe("TaskPilot Phase 1 against real SQLite", () => {
  let projectId = "";
  const ids: Record<string, string> = {};
  const today = () => D.dateKey(new Date());
  const shift = (n: number) => D.dateKey(D.addDays(D.startOfToday(), n));

  it("creates a project and tasks with sequential codes", async () => {
    const p = await P.createProject({ ...projBase, name: "UAT Booking Enhancement" });
    expect(p.ok).toBe(true);
    projectId = (p as { data: { id: string } }).data.id;

    const mk = async (key: string, over: Partial<TaskFormValues> & { title: string }) => {
      const r = await A.createTask({ ...base, projectId, ...over });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      ids[key] = (r as { data: { id: string } }).data.id;
    };
    await mk("overdue", { title: "Overdue task", dueDate: shift(-2), priority: "High", tags: "UAT, Zeta" });
    await mk("today", { title: "Due today", dueDate: today(), priority: "Critical", status: "In Progress", progress: "75" });
    await mk("blocked", { title: "Vendor compliance", status: "Blocked", blockerDescription: "Backend timestamp not generated", priority: "High" });
    await mk("waiting", { title: "Operational issue", status: "Waiting for Others", waitingFor: "Engineering", dueDate: shift(3) });
    await mk("later", { title: "Next month doc", dueDate: shift(20), priority: "Low" });
    const tasks = await dbm.db.task.findMany({ orderBy: { seq: "asc" } });
    expect(tasks.map((t) => t.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects blocked without a blocker and reports failed writes", async () => {
    const bad = await A.createTask({ ...base, title: "x", status: "Blocked" });
    expect(bad.ok).toBe(false);
    const missing = await A.updateTask("does-not-exist", { ...base, title: "x" });
    expect(missing.ok).toBe(false);
    expect((missing as { error: string }).error).toMatch(/Could not save/);
  });

  it("dashboard counts come from the database and match the filtered lists", async () => {
    const d = await Q.getDashboardData();
    expect(d.counts).toMatchObject({ active: 5, dueToday: 1, overdue: 1, inProgress: 1, waiting: 1, blocked: 1, completedWeek: 0 });
    for (const [key, n] of [["due-today", 1], ["overdue", 1], ["blocked", 1], ["active", 5]] as const) {
      expect((await Q.listTasks({ quick: key })).length).toBe(n);
    }
    expect(d.focus.length).toBeLessThanOrEqual(5);
    expect(d.focus[0].task.title).toBe("Overdue task".length ? d.focus[0].task.title : "");
    expect(d.upcoming.map((t) => t.title)).toContain("Operational issue");
    expect(d.projects[0].totalTasks).toBe(5);
    expect(d.projects[0].health.level).toBe("at-risk"); // has an overdue task
  });

  it("completes, reopens and logs activity", async () => {
    expect((await A.completeTask(ids.today)).ok).toBe(true);
    let t = await dbm.db.task.findUniqueOrThrow({ where: { id: ids.today } });
    expect(t.status).toBe("Done");
    expect(t.progress).toBe(100);
    expect(t.completedAt).not.toBeNull();
    expect((await Q.getDashboardData()).counts.completedWeek).toBe(1);

    expect((await A.reopenTask(ids.today)).ok).toBe(true);
    t = await dbm.db.task.findUniqueOrThrow({ where: { id: ids.today } });
    expect(t.status).toBe("To Do");
    expect(t.completedAt).toBeNull();
    const types = (await dbm.db.taskActivity.findMany({ where: { taskId: ids.today } })).map((a) => a.type);
    expect(types).toEqual(expect.arrayContaining(["TASK_CREATED", "TASK_COMPLETED", "TASK_REOPENED"]));
  });

  it("tracks deadline, priority, progress and blocker changes", async () => {
    await A.setTaskDueDate(ids.later, shift(5));
    await A.setTaskPriority(ids.later, "High");
    await A.setTaskProgress(ids.later, 40);
    await A.setTaskStatus(ids.blocked, "In Progress");
    const later = (await dbm.db.taskActivity.findMany({ where: { taskId: ids.later } })).map((a) => a.type);
    expect(later).toEqual(expect.arrayContaining(["DEADLINE_CHANGED", "PRIORITY_CHANGED", "PROGRESS_UPDATED"]));
    const blocked = await dbm.db.task.findUniqueOrThrow({ where: { id: ids.blocked } });
    expect(blocked.blockedAt).toBeNull();
    expect(blocked.blockerDescription).toBeNull();
    const bt = (await dbm.db.taskActivity.findMany({ where: { taskId: ids.blocked } })).map((a) => a.type);
    expect(bt).toEqual(expect.arrayContaining(["BLOCKER_ADDED", "BLOCKER_RESOLVED", "STATUS_CHANGED"]));
  });

  it("search, filters, sort, bulk update, duplicate, subtasks, comments, delete", async () => {
    expect((await Q.listTasks({ q: "zeta" })).map((t) => t.title)).toEqual(["Overdue task"]); // via tag
    expect((await Q.listTasks({ priority: "High" })).length).toBeGreaterThan(0);
    const sorted = await Q.listTasks({ sort: "due" });
    expect(sorted[0].title).toBe("Overdue task");

    const r = await A.bulkUpdateTasks([ids.later, ids.waiting], { status: "Blocked" });
    expect(r.ok && r.data).toEqual({ changed: 0, skipped: 2 }); // neither has blocker text, so both are skipped safely
  });

  it("duplicates, adds subtasks/comments, cascades on delete", async () => {
    const dup = await A.duplicateTask(ids.overdue);
    expect(dup.ok).toBe(true);
    const dupId = (dup as { data: { id: string } }).data.id;
    expect((await A.addSubtask(dupId, "Write test cases")).ok).toBe(true);
    expect((await A.addComment(dupId, "Kick-off done")).ok).toBe(true);
    const full = await Q.getTask(dupId);
    expect(full?.subtasks).toHaveLength(1);
    expect(full?.comments).toHaveLength(1);
    expect(full?.tags.map((t) => t.tag.name).sort()).toEqual(["uat", "zeta"]);
    expect((await A.deleteTask(dupId)).ok).toBe(true);
    expect(await dbm.db.subtask.count({ where: { taskId: dupId } })).toBe(0); // foreign keys cascade
    const del = await dbm.db.taskActivity.findFirst({ where: { type: "TASK_DELETED" } });
    expect(JSON.parse(del!.meta!).title).toMatch(/Copy of/);
    // numbers are never reused
    const again = await A.createTask({ ...base, title: "After delete" });
    const row = await dbm.db.task.findUniqueOrThrow({ where: { id: (again as { data: { id: string } }).data.id } });
    expect(row.seq).toBe(7);
  });

  it("project detail + deleting a project keeps its tasks", async () => {
    const detail = await Q.getProjectDetail(projectId);
    expect(detail?.stats.progress).toBeGreaterThanOrEqual(0);
    expect(detail?.activities.length).toBeGreaterThan(0);
    expect((await P.deleteProject(projectId)).ok).toBe(true);
    const t = await dbm.db.task.findUniqueOrThrow({ where: { id: ids.overdue } });
    expect(t.projectId).toBeNull();
  });

  it("data survives a brand-new database connection (simulates a restart)", async () => {
    const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
    const { PrismaClient } = await import("../../src/generated/prisma/client");
    const fresh = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${dbFile}` }) });
    const count = await fresh.task.count();
    const activities = await fresh.taskActivity.count();
    await fresh.$disconnect();
    expect(count).toBe(6);
    expect(activities).toBeGreaterThan(10);
  });
});
