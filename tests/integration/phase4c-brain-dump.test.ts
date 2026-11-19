import { beforeAll, describe, expect, it, vi } from "vitest";
import { applyMigrations, tmp } from "./helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
/* eslint-disable @typescript-eslint/no-explicit-any */
const dbFile = tmp("brain-dump.db");
let T: any, C: any, CD: any, BP: any, V: any, P: any, dbm: any;
const now = new Date("2026-11-19T03:00:00Z");
let projectId = "";

beforeAll(async () => {
  applyMigrations(dbFile);
  process.env.DATABASE_URL = `file:${dbFile}`;
  T = await import("../../src/actions/tasks"); C = await import("../../src/actions/capture"); P = await import("../../src/actions/projects");
  CD = await import("../../src/lib/capture-data"); BP = await import("../../src/lib/bulk-parse"); V = await import("../../src/lib/validators");
  dbm = await import("../../src/lib/db");
  projectId = (await P.createProject({ name: "UAT Booking", description: "", owner: "", category: "", priority: "High", status: "Active", startDate: "", targetDate: "", risks: "", notes: "" })).data.id;
});

const run = async (text: string, defaults: object = {}) => {
  const { items } = BP.parseBrainDump(text, { projects: [{ id: projectId, name: "UAT Booking" }], defaults: { status: "To Do", priority: "Medium", category: "Other", projectId: "", ...defaults } }, now);
  return { items, res: await T.createTasksBulk(items.map((i: any) => i.values)) };
};

describe("Brain Dump end to end (text -> parsed -> saved in SQLite)", () => {
  it("a realistic day of activities becomes complete, correct tasks in one go", async () => {
    const { items, res } = await run(`# Thursday
Follow up Andi about the API timestamp tomorrow !h @booking ~15m #uat
[x] Sent weekly report to Budi
doing: Review PRD %40 => finish section 3
blocked: Vendor compliance @uat => backend timestamp missing
Operational issue update >Engineering
- 2. Prepare slides for 25 Nov ~1h #deck`);
    expect(items).toHaveLength(6);
    expect(res.ok, JSON.stringify(res)).toBe(true);
    expect(res.data.failed).toEqual([]);
    expect(res.data.created.map((c: any) => c.code)).toEqual(["TP-0001", "TP-0002", "TP-0003", "TP-0004", "TP-0005", "TP-0006"]);

    const byTitle = async (t: string) => dbm.db.task.findFirstOrThrow({ where: { title: t }, include: { tags: { include: { tag: true } } } });
    const follow = await byTitle("Follow up Andi about the API timestamp");
    expect(follow).toMatchObject({ projectId, priority: "High", estimatedMinutes: 15, category: "Stakeholder Follow-up", status: "To Do" });
    expect(follow.followUpDate.toISOString()).toBe("2026-11-19T17:00:00.000Z"); // 20 Nov 00:00 Jakarta
    expect(follow.tags.map((t: any) => t.tag.name)).toEqual(["uat"]);
    const done = await byTitle("Sent weekly report to Budi");
    expect(done).toMatchObject({ status: "Done", progress: 100 });
    expect(done.completedAt).not.toBeNull();
    const doing = await byTitle("Review PRD");
    expect(doing).toMatchObject({ status: "In Progress", progress: 40, nextAction: "finish section 3" });
    const blocked = await byTitle("Vendor compliance");
    expect(blocked).toMatchObject({ status: "Blocked", blockerDescription: "backend timestamp missing", projectId });
    expect(blocked.blockedAt).not.toBeNull();
    const waiting = await byTitle("Operational issue update");
    expect(waiting).toMatchObject({ status: "Waiting for Others", waitingFor: "Engineering" });
    const slides = await byTitle("Prepare slides for");
    expect(slides.estimatedMinutes).toBe(60);
    expect(slides.dueDate.toISOString()).toBe("2026-11-24T17:00:00.000Z"); // 25 Nov Jakarta

    const types = (await dbm.db.taskActivity.findMany()).map((a: any) => a.type);
    expect(types.filter((t: string) => t === "TASK_CREATED")).toHaveLength(6);
    expect(types).toContain("BLOCKER_ADDED");
  });

  it("invalid rows are reported and skipped; valid ones are still saved; nothing is half-created", async () => {
    const before = await dbm.db.task.count();
    const good = V.taskFormSchema.parse({ ...BP.parseBrainDump("Good task", { projects: [], defaults: { status: "To Do", priority: "Medium", category: "Other", projectId: "" } }, now).items[0].values });
    const blockedNoReason = { ...good, title: "Bad: blocked", status: "Blocked", blockerDescription: "" };
    const ghostProject = { ...good, title: "Bad: project gone", projectId: "does-not-exist" };
    const res = await T.createTasksBulk([good, blockedNoReason, ghostProject, { ...good, title: "Another good" }]);
    expect(res.ok).toBe(true);
    expect(res.data.created.map((c: any) => c.index)).toEqual([0, 3]);
    expect(res.data.failed).toEqual([{ index: 1, error: "Describe what is blocking this task" }, { index: 2, error: "That project no longer exists" }]);
    expect(await dbm.db.task.count()).toBe(before + 2);
    const none = await T.createTasksBulk([blockedNoReason]);
    expect(none.data.created).toEqual([]);
    expect(await dbm.db.task.count()).toBe(before + 2);
  });

  it("guards: nothing to create, too many, and a clean error instead of a crash", async () => {
    expect((await T.createTasksBulk([])).ok).toBe(false);
    expect((await T.createTasksBulk(Array.from({ length: 101 }, () => ({})))).error).toMatch(/at most 100/);
    const junk = await T.createTasksBulk([{ title: 5 }, null]);
    expect(junk.ok).toBe(true);
    expect(junk.data.failed).toHaveLength(2);
  });

  it("duplicate check ignores case and finished tasks", async () => {
    const d = await T.checkDuplicates(["review prd", "SENT WEEKLY REPORT TO BUDI", "Something new", "  "]);
    expect(d.data).toEqual({ "review prd": "TP-0003" }); // the finished one is not a duplicate
    expect((await T.checkDuplicates([])).data).toEqual({});
  });

  it("the daily routine is saved, trimmed, limited, and survives", async () => {
    expect(await CD.getRoutine()).toBe("");
    expect((await C.saveRoutine("  Daily standup !m ~15m\r\nCheck UAT dashboard  \n")).ok).toBe(true);
    expect(await CD.getRoutine()).toBe("Daily standup !m ~15m\nCheck UAT dashboard");
    expect((await C.saveRoutine("x".repeat(5001))).ok).toBe(false);
    expect(await CD.getRoutine()).toBe("Daily standup !m ~15m\nCheck UAT dashboard");
    // the routine lines parse like any other lines
    const { res } = await run(await CD.getRoutine(), { status: "Done" });
    expect(res.data.created).toHaveLength(2);
  });

  it("often-used titles are ranked by how often you create them", async () => {
    for (let i = 0; i < 3; i++) await T.createTasksBulk([V.taskFormSchema.parse({ ...BP.parseBrainDump("Daily standup", { projects: [], defaults: { status: "Done", priority: "Medium", category: "Other", projectId: "" } }, now).items[0].values })]);
    await T.duplicateTask((await dbm.db.task.findFirstOrThrow({ where: { title: "Review PRD" } })).id);
    const titles = await CD.getRecentTitles(5);
    expect(titles[0]).toBe("Daily standup");
    expect(titles.some((t: string) => t.startsWith("Copy of"))).toBe(false);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("applyBrainDump: create, update and new projects in one transaction", () => {
  const defaults = { status: "To Do", priority: "Medium", category: "Other", projectId: "" } as const;
  const toRows = (plan: any[]) => plan.filter((r: any) => r.action.kind !== "skip").map((r: any) => r.action.kind === "update"
    ? { kind: "update", taskId: r.action.taskId, patch: BP2.buildUpdate(r.values, new Set(r.explicit), r.matches.find((m: any) => m.task.id === r.action.taskId).task).patch }
    : { kind: "create", values: r.values });
  let BP2: any, BPL: any;

  it("the same paste twice never creates duplicates, and a typo'd status line updates the real task", async () => {
    BP2 = await import("../../src/lib/brain-plan");
    BPL = BP2;
    const seed = await T.createTasksBulk([
      V.taskFormSchema.parse({ ...BP.parseBrainDump("Review PRD v2 #doc", { projects: [], defaults }, now).items[0].values, assignee: "Andi" }),
      V.taskFormSchema.parse({ ...BP.parseBrainDump("[x] Sent weekly report to Budi", { projects: [], defaults }, now).items[0].values, stakeholder: "Budi Santoso" }),
    ]);
    expect(seed.data.created).toHaveLength(2);
    const known = await CD.getBrainDumpKnown();
    expect(known.people).toEqual(expect.arrayContaining(["Andi", "Budi Santoso", "Engineering"]));
    expect(known.tags).toEqual(expect.arrayContaining(["doc", "uat"]));

    const text = "[x] revew PRD v2\nFollw up Andy about pricing sheet tommorow !h @bokking\nDraft spec @zeta-launch #zeta\nRetest bokking cases";
    const plan1 = BPL.planBrainDump(text, known, defaults, now).rows;
    expect(plan1.map((r: any) => r.action.kind)).toEqual(["update", "create", "create", "create"]);
    const res = await T.applyBrainDump(toRows(plan1));
    expect(res.ok, JSON.stringify(res)).toBe(true);
    expect(res.data.rows.map((r: any) => r.kind)).toEqual(["updated", "created", "created", "created"]);
    expect(res.data.newProjects).toEqual(["Zeta Launch"]);

    const prd = await dbm.db.task.findFirstOrThrow({ where: { title: "Review PRD v2" } });
    expect(prd).toMatchObject({ status: "Done", progress: 100 });
    expect(prd.completedAt).not.toBeNull();
    expect(await dbm.db.task.count({ where: { title: "Review PRD v2" } })).toBe(1); // no duplicate
    const follow = await dbm.db.task.findFirstOrThrow({ where: { title: "Follow up Andy about pricing sheet" } });
    expect(follow).toMatchObject({ projectId, priority: "High", category: "Stakeholder Follow-up" });
    const zeta = await dbm.db.project.findFirstOrThrow({ where: { name: "Zeta Launch" } });
    expect((await dbm.db.task.findFirstOrThrow({ where: { title: "Draft spec" } })).projectId).toBe(zeta.id);
    expect((await dbm.db.task.findFirstOrThrow({ where: { title: "Retest bokking cases" } })).projectId).toBe(projectId); // found through the typo
    expect((await dbm.db.taskActivity.findMany({ where: { type: "PROJECT_CREATED", message: { contains: "Zeta Launch" } } }))).toHaveLength(1);

    // pasting the very same text again: everything is recognised, nothing is created
    const plan2 = BPL.planBrainDump(text, await CD.getBrainDumpKnown(), defaults, now).rows;
    expect(plan2.map((r: any) => r.action.kind)).toEqual(["skip", "skip", "skip", "skip"]); // nothing differs, so nothing is touched
    expect(plan2[0].action.reason).toMatch(/Already done/);
    expect(plan2[2].values.projectId).toBe(zeta.id); // @zeta-launch now matches the project that was created
    const before = await dbm.db.task.count();
    await T.applyBrainDump(toRows(plan2));
    expect(await dbm.db.task.count()).toBe(before);
    expect(await dbm.db.project.count({ where: { name: "Zeta Launch" } })).toBe(1);
  });

  it("updates apply only what the line stated: status transitions, blockers, waiting, tags merge, project change", async () => {
    const mk = async (title: string, over: object = {}) => (await T.createTasksBulk([V.taskFormSchema.parse({ ...BP.parseBrainDump(title, { projects: [], defaults }, now).items[0].values, ...over })])).data.created[0].id;
    const a = await mk("Alpha task", { tags: "one", priority: "Low" });
    const b = await mk("Beta task");
    const c = await mk("Gamma task", { status: "In Progress" });
    const res = await T.applyBrainDump([
      { kind: "update", taskId: a, patch: { tags: "two, one", progress: "30", nextAction: "call vendor" } },
      { kind: "update", taskId: b, patch: { status: "Blocked", blockerDescription: "No access" } },
      { kind: "update", taskId: c, patch: { status: "Waiting for Others", waitingFor: "Engineering", followUpDate: "2026-12-01" } },
    ]);
    expect(res.ok).toBe(true);
    const A = await dbm.db.task.findUniqueOrThrow({ where: { id: a }, include: { tags: { include: { tag: true } } } });
    expect(A).toMatchObject({ progress: 30, nextAction: "call vendor", priority: "Low" }); // priority untouched
    expect(A.tags.map((t: any) => t.tag.name).sort()).toEqual(["one", "two"]); // merged, not replaced
    expect(await dbm.db.task.findUniqueOrThrow({ where: { id: b } })).toMatchObject({ status: "Blocked", blockerDescription: "No access" });
    const C = await dbm.db.task.findUniqueOrThrow({ where: { id: c } });
    expect(C).toMatchObject({ status: "Waiting for Others", waitingFor: "Engineering" });
    expect(C.blockedAt).not.toBeNull();
    const types = (await dbm.db.taskActivity.findMany({ where: { taskId: b } })).map((x: any) => x.type);
    expect(types).toEqual(expect.arrayContaining(["BLOCKER_ADDED", "STATUS_CHANGED"]));
    // reopen a finished task
    expect((await T.applyBrainDump([{ kind: "update", taskId: a, patch: { status: "Done" } }])).ok).toBe(true);
    expect((await T.applyBrainDump([{ kind: "update", taskId: a, patch: { status: "In Progress" } }])).ok).toBe(true);
    const reopened = await dbm.db.task.findUniqueOrThrow({ where: { id: a } });
    expect(reopened.status).toBe("In Progress");
    expect(reopened.completedAt).toBeNull();
  });

  it("bad rows are reported with the reason; good rows still save; reuses an existing project instead of duplicating it", async () => {
    const t = await dbm.db.task.findFirstOrThrow({ where: { title: "Alpha task" } });
    const good = V.taskFormSchema.parse({ ...BP.parseBrainDump("Fine task", { projects: [], defaults }, now).items[0].values });
    const before = await dbm.db.project.count();
    const res = await T.applyBrainDump([
      { kind: "create", values: { ...good, projectId: "new:uat booking" } },       // exists already (case-insensitive)
      { kind: "update", taskId: "ghost", patch: { status: "Done" } },
      { kind: "update", taskId: t.id, patch: {} },
      { kind: "update", taskId: t.id, patch: { status: "Blocked" } },               // no reason anywhere
      { kind: "update", taskId: t.id, patch: { status: "Waiting for Others" } },
      { kind: "update", taskId: t.id, patch: { progress: "500" } },
      { kind: "update", taskId: t.id, patch: { surprise: "x" } },
      { kind: "create", values: { ...good, title: "" } },
      { kind: "create", values: { ...good, title: "Needs project", projectId: "new:" } },
      { kind: "create", values: { ...good, title: "Ghost project", projectId: "no-such-id" } },
      { kind: "nonsense" }, null,
    ]);
    expect(res.ok).toBe(true);
    const errors = res.data.rows.filter((r: any) => "error" in r).map((r: any) => [r.index, r.error]);
    expect(res.data.rows.find((r: any) => r.index === 0).kind).toBe("created");
    expect(errors.map((e: any) => e[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(errors[0][1]).toMatch(/no longer exists/);
    expect(errors[2][1]).toMatch(/blocking/);
    expect(errors[3][1]).toMatch(/waiting/i);
    expect(await dbm.db.project.count()).toBe(before);
    expect((await dbm.db.task.findFirstOrThrow({ where: { title: "Fine task" } })).projectId).toBe(projectId);
  });

  it("guards: empty, too many", async () => {
    expect((await T.applyBrainDump([])).ok).toBe(false);
    expect((await T.applyBrainDump(Array.from({ length: 101 }, () => ({ kind: "create" })))).error).toMatch(/at most 100/);
    const none = await T.applyBrainDump([{ kind: "update", taskId: "ghost", patch: { status: "Done" } }]);
    expect(none.ok).toBe(true);
    expect(none.data.newProjects).toEqual([]);
  });

  it("known data: people use the most common spelling; only open and recently finished tasks are offered", async () => {
    await T.createTasksBulk([1, 2, 3].map((n) => V.taskFormSchema.parse({ ...BP.parseBrainDump(`Ping ${n}`, { projects: [], defaults }, now).items[0].values, assignee: n < 3 ? "Siti Aminah" : "siti aminah" })));
    const old = await T.createTasksBulk([V.taskFormSchema.parse({ ...BP.parseBrainDump("[x] Ancient chore", { projects: [], defaults }, now).items[0].values })]);
    await dbm.db.task.update({ where: { id: old.data.created[0].id }, data: { completedAt: new Date(Date.now() - 40 * 86_400_000) } });
    const k = await CD.getBrainDumpKnown();
    expect(k.people.filter((p: string) => p.toLowerCase() === "siti aminah")).toEqual(["Siti Aminah"]);
    expect(k.tasks.some((t: any) => t.title === "Ancient chore")).toBe(false);
    expect(k.tasks.some((t: any) => t.title === "Ping 1")).toBe(true);
    expect(k.tasks.every((t: any) => /^TP-\d{4}$/.test(t.code))).toBe(true);
  });
});
