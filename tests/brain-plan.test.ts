import { describe, expect, it } from "vitest";
import { buildIndex, buildUpdate, matchTasks, planBrainDump, type KnownData, type KnownTask } from "@/lib/brain-plan";

const now = new Date("2026-11-19T03:00:00Z");
const task = (n: number, title: string, o: Partial<KnownTask> = {}): KnownTask => ({ id: `id${n}`, code: `TP-000${n}`, title, status: "To Do", projectId: null, progress: 0, priority: "Medium", dueDate: "", followUpDate: "", estimatedMinutes: null, nextAction: "", waitingFor: "", blocker: "", tags: [], ...o });
const known: KnownData = {
  projects: [{ id: "p1", name: "UAT Booking" }, { id: "p2", name: "HSE Portal" }],
  tasks: [task(1, "Review PRD v2"), task(2, "Sent weekly report to Budi", { status: "Done", progress: 100 }), task(3, "Follow up Budi about API"), task(4, "Standup", { projectId: "p2" }), task(5, "Prepare release notes", { projectId: "p1" })],
  people: ["Andi", "Budi Santoso"],
  tags: ["uat"],
};
const defaults = { status: "To Do", priority: "Medium", category: "Other", projectId: "" } as const;
const plan = (text: string, k = known) => planBrainDump(text, k, { ...defaults }, now).rows;
const one = (text: string) => plan(text)[0];

describe("matching a line to an existing task", () => {
  const idx = buildIndex(known.tasks);
  it("finds the same task despite typos and filler words", () => {
    for (const t of ["Review PRD v2", "Revew PRD v2", "review the PRD v2", "Rview PRD v2", "PRD v2 review"]) {
      const m = matchTasks(t, idx);
      expect(m[0]?.task.code, t).toBe("TP-0001");
      expect(m[0].strong, t).toBe(true);
    }
    expect(matchTasks("Send weekly report to Budi", idx)[0].task.code).toBe("TP-0002");
  });
  it("points out similar tasks without calling them the same", () => {
    const m = matchTasks("Review PRD", idx);
    expect(m[0]).toMatchObject({ strong: false });
    expect(m[0].task.code).toBe("TP-0001");
    expect(matchTasks("Follow up Andi about API", idx)[0]).toMatchObject({ strong: false });
  });
  it("different work has no match, and an empty title matches nothing", () => {
    expect(matchTasks("Book flight to Bali", idx)).toEqual([]);
    expect(matchTasks("", idx)).toEqual([]);
    expect(matchTasks("the and of", idx)).toEqual([]);
  });
  it("is fast on a large workspace", () => {
    const big = buildIndex(Array.from({ length: 1500 }, (_, i) => task(i, `Task number ${i} about subject ${i % 37} and topic ${i % 11}`)));
    const t0 = Date.now();
    for (let i = 0; i < 100; i++) matchTasks(`Task about subject ${i % 37}`, big);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe("what to do with each line", () => {
  it("a status line on an existing task updates it instead of duplicating it", () => {
    const r = one("[x] Revew PRD v2");
    expect(r.action).toEqual({ kind: "update", taskId: "id1" });
    expect(buildUpdate(r.values, new Set(r.explicit), known.tasks[0])).toEqual({ patch: { status: "Done" }, summary: ["Status → Done"], problem: undefined });
  });
  it("a plain line that already exists is skipped; a finished one says so", () => {
    expect(one("Review PRD v2").action).toEqual({ kind: "skip", reason: "Already exists as TP-0001" });
    expect(one("Sent weekly report to Budi").action).toEqual({ kind: "skip", reason: "Already done as TP-0002" });
    expect(one("[x] Sent weekly report to Budi").action.kind).toBe("skip"); // nothing would change
  });
  it("only changed fields are applied, and only those the line stated", () => {
    const r = one("doing: Review PRD v2 %60 !h #uat => finish section 3");
    expect(r.action.kind).toBe("update");
    expect(buildUpdate(r.values, new Set(r.explicit), known.tasks[0]).patch).toEqual({ status: "In Progress", progress: "60", priority: "High", nextAction: "finish section 3", tags: "uat" });
    const same = buildUpdate(r.values, new Set(r.explicit), task(9, "Review PRD v2", { status: "In Progress", progress: 60, priority: "High" }));
    expect(Object.keys(same.patch)).toEqual(["nextAction", "tags"]);
  });
  it("similar-but-not-same tasks are created, with the lookalike shown", () => {
    const r = one("Review PRD");
    expect(r.action.kind).toBe("create");
    expect(r.matches[0].task.code).toBe("TP-0001");
    expect(one("Brand new work").matches).toEqual([]);
  });
  it("blocking an existing task needs a reason", () => {
    const r = one("blocked: Standup");
    expect(r.action.kind).toBe("update");
    expect(buildUpdate(r.values, new Set(r.explicit), known.tasks[3]).problem).toMatch(/need a reason/);
    expect(buildUpdate(one("blocked: Standup => no room").values, new Set(one("blocked: Standup => no room").explicit), known.tasks[3]).problem).toBeUndefined();
  });
  it("does everything together on a messy paste, in one pass", () => {
    const rows = plan(`# Today
- [x] revew PRD v2
- Follw up Andy about the API tommorow !h @bokking
- Sent weekly report to Budi
- retest bokking cases
- Draft spec @zeta
- Brand new idea`);
    expect(rows.map((r) => r.action.kind)).toEqual(["update", "create", "skip", "create", "create", "create"]);
    expect(rows[1].values).toMatchObject({ projectId: "p1", followUpDate: "2026-11-20", priority: "High", category: "Stakeholder Follow-up" });
    expect(rows[3].values.projectId).toBe("p1"); // guessed from the typo'd word
    expect(rows[4].values.projectId).toBe("new:Zeta");
    expect(rows[2].action).toEqual({ kind: "skip", reason: "Already done as TP-0002" });
  });
});
