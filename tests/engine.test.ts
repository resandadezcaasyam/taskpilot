import { describe, expect, it } from "vitest";
import { parseDateKey } from "@/lib/dates";
import { rankAll, recommend, type EngineTask } from "@/lib/engine";
import { buildSections } from "@/lib/planner";
import { computeReminders } from "@/lib/reminders-calc";
import { DEFAULT_SETTINGS, mergeSettings } from "@/lib/settings";

const now = new Date("2026-11-19T03:00:00Z"); // Thu 19 Nov 2026, 10:00 Jakarta
const day = (n: number) => parseDateKey(`2026-11-${String(19 + n).padStart(2, "0")}`);
const ago = (n: number) => new Date(now.getTime() - n * 86_400_000);

const task = (o: Partial<EngineTask> = {}): EngineTask => ({
  id: "t1", seq: 1, title: "Task", status: "To Do", priority: "Medium", category: "Other", progress: 0,
  dueDate: null, followUpDate: null, updatedAt: now, blockedAt: null, blockerDescription: null, waitingFor: null,
  estimatedMinutes: null, businessImportance: 3, nextAction: null, nextActionDue: null, dependencies: [], ...o,
});
const rec = (o: Partial<EngineTask>, override?: { text: string; pinned: boolean }) => recommend(task(o), DEFAULT_SETTINGS, now, override)!;

describe("spec scenarios", () => {
  it("A: in-progress UAT at 75% -> continue executing test cases", () => {
    const r = rec({ title: "UAT Booking Enhancement", status: "In Progress", progress: 75, category: "UAT / QA" });
    expect(r.kind).toBe("Continue Progress");
    expect(r.action).toBe("Continue executing the remaining test cases and document the findings.");
  });
  it("A (urgent): an in-progress task due today is continued, not started", () => {
    const r = rec({ status: "In Progress", progress: 75, category: "UAT / QA", priority: "High", dueDate: day(0) });
    expect(r.kind).toBe("Do Now");
    expect(r.action).toBe("Continue executing the remaining test cases and document the findings. It is due today.");
  });
  it("B: blocked by missing backend timestamp -> follow up with engineering for a fix date", () => {
    const r = rec({ status: "Blocked", blockerDescription: "Backend timestamp not generated", waitingFor: "the engineering team", blockedAt: ago(3) });
    expect(r.kind).toBe("Resolve Blocker");
    expect(r.action).toContain("Follow up with the engineering team");
    expect(r.action).toContain("Backend timestamp not generated");
    expect(r.action).toContain("estimated fix date");
  });
  it("C: in review at 95% -> retest and confirm sign-off", () => {
    const r = rec({ status: "In Review", progress: 95 });
    expect(r.kind).toBe("Review");
    expect(r.action).toBe("Retest the remaining issue and confirm whether the feature is ready for sign-off.");
  });
  it("D: waiting 3 days on an operational issue -> request an investigation update", () => {
    const r = rec({ status: "Waiting for Others", category: "Operational Support", waitingFor: "the responsible PIC", updatedAt: ago(3), blockedAt: ago(3) });
    expect(r.kind).toBe("Follow Up");
    expect(r.action).toBe("Request an investigation update from the responsible PIC.");
    expect(r.needsFollowUp).toBe(true);
  });
});

describe("scoring", () => {
  it("never recommends done or cancelled tasks", () => {
    expect(recommend(task({ status: "Done" }), DEFAULT_SETTINGS, now)).toBeNull();
    expect(recommend(task({ status: "Cancelled" }), DEFAULT_SETTINGS, now)).toBeNull();
  });
  it("is not just deadline order: a blocked critical task outranks a plain task due tomorrow", () => {
    const blocked = rec({ priority: "Critical", status: "Blocked", blockerDescription: "x", blockedAt: ago(5), dueDate: day(5) });
    const plain = rec({ priority: "Low", dueDate: day(1) });
    expect(blocked.score).toBeGreaterThan(plain.score);
  });
  it("overdue beats due-later at equal priority; scores stay within 0-100", () => {
    const over = rec({ priority: "High", dueDate: day(-3) });
    const later = rec({ priority: "High", dueDate: day(6) });
    expect(over.score).toBeGreaterThan(later.score);
    expect(over.kind).toBe("Do Now");
    for (const r of [over, later]) expect(r.score >= 0 && r.score <= 100).toBe(true);
  });
  it("fresh waiting tasks are de-emphasised until follow-up is due", () => {
    const fresh = rec({ status: "Waiting for Others", waitingFor: "QA", priority: "High" });
    const due = rec({ status: "Waiting for Others", waitingFor: "QA", priority: "High", followUpDate: day(0) });
    expect(due.score).toBeGreaterThan(fresh.score);
    expect(fresh.action).toContain("Waiting on QA");
  });
  it("respects configurable weights", () => {
    const t = task({ priority: "Low", dueDate: day(-1) });
    const deadlineHeavy = recommend(t, mergeSettings({ weights: { deadline: 100, priority: 0, followUp: 0, inactivity: 0, effort: 0 } }), now)!;
    const priorityHeavy = recommend(t, mergeSettings({ weights: { deadline: 0, priority: 100, followUp: 0, inactivity: 0, effort: 0 } }), now)!;
    expect(deadlineHeavy.score).toBe(100);
    expect(priorityHeavy.score).toBeLessThan(40);
  });
  it("tasks with an unfinished dependency are discounted and point at the dependency", () => {
    const dep = { id: "d", title: "API fix", status: "In Progress", dueDate: day(-2) };
    const r = rec({ dependencies: [dep], priority: "High" });
    expect(r.kind).toBe("Resolve Blocker");
    expect(r.action).toContain("API fix");
  });
  it("manual override replaces the text; pinning forces score 100 and survives postponement", () => {
    const r = rec({ title: "x" }, { text: "Call Budi first", pinned: true });
    expect(r.action).toBe("Call Budi first");
    expect(r.source).toBe("override");
    expect(r.score).toBe(100);
    const out = rankAll([task()], DEFAULT_SETTINGS, now, new Map([["t1", { text: "", pinned: true }]]), new Map([["t1", day(3)]]));
    expect(out.recommendations).toHaveLength(1);
  });
});

describe("rankAll", () => {
  it("orders by score, numbers the suggested order, and hides postponed tasks until their date", () => {
    const tasks = [
      task({ id: "a", seq: 1, priority: "Low" }),
      task({ id: "b", seq: 2, priority: "Critical", dueDate: day(0) }),
      task({ id: "c", seq: 3, priority: "High", dueDate: day(-1) }),
    ];
    const out = rankAll(tasks, DEFAULT_SETTINGS, now, new Map(), new Map([["c", day(1)]]));
    expect(out.recommendations.map((r) => [r.task.id, r.order])).toEqual([["b", 1], ["a", 2]]);
    expect(out.postponed.map((p) => p.task.id)).toEqual(["c"]);
    const later = rankAll(tasks, DEFAULT_SETTINGS, new Date("2026-11-20T03:00:00Z"), new Map(), new Map([["c", day(1)]]));
    expect(later.postponed).toHaveLength(0);
    expect(later.recommendations.map((r) => r.task.id)).toContain("c");
  });
});

describe("Today Planner sections", () => {
  it("assigns each task to exactly one section", () => {
    const tasks = [
      task({ id: "due", seq: 1, dueDate: day(0), priority: "High" }),
      task({ id: "blk", seq: 2, status: "Blocked", blockerDescription: "x", blockedAt: ago(2) }),
      task({ id: "quick", seq: 3, estimatedMinutes: 15, priority: "Medium", dueDate: day(10) }),
      task({ id: "soon", seq: 4, dueDate: day(4), priority: "Low" }),
      task({ id: "big", seq: 5, priority: "High", estimatedMinutes: 480, dueDate: day(9) }),
    ];
    const { recommendations } = rankAll(tasks, DEFAULT_SETTINGS, now);
    const s = buildSections(recommendations, DEFAULT_SETTINGS, now);
    const ids = (l: typeof s.mustDo) => l.map((r) => r.task.id);
    expect(ids(s.mustDo)).toEqual(["due"]);
    expect(ids(s.followUps)).toEqual(["blk"]);
    expect(ids(s.quickWins)).toContain("quick");
    expect(ids(s.upcoming)).toContain("soon");
    const all = [...ids(s.mustDo), ...ids(s.followUps), ...ids(s.focus), ...ids(s.quickWins), ...ids(s.upcoming)];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("reminders", () => {
  const rt = (o: object = {}) => ({ id: "t1", title: "Vendor", status: "To Do", dueDate: null, followUpDate: null, updatedAt: now, blockedAt: null, ...o });
  it("covers overdue, approaching, follow-up, blocker and inactivity", () => {
    const types = (o: object) => computeReminders([rt(o)], DEFAULT_SETTINGS, now).map((r) => r.type);
    expect(types({ dueDate: day(-2) })).toContain("OVERDUE");
    expect(types({ dueDate: day(1) })).toEqual(["DEADLINE_APPROACHING"]);
    expect(types({ dueDate: day(5) })).toEqual([]);
    expect(types({ followUpDate: day(0), status: "Waiting for Others" })).toEqual(["FOLLOW_UP_DUE"]);
    expect(types({ status: "Blocked", blockedAt: ago(3) })).toEqual(["UNRESOLVED_BLOCKER"]);
    expect(types({ status: "Blocked", blockedAt: ago(1) })).toEqual([]);
    expect(types({ status: "In Progress", updatedAt: ago(4) })).toEqual(["INACTIVE_TASK"]);
    expect(types({ status: "Done", dueDate: day(-5) })).toEqual([]);
  });
  it("recomputes when the calendar date changes", () => {
    const t = rt({ dueDate: day(0) });
    expect(computeReminders([t], DEFAULT_SETTINGS, now)[0].type).toBe("DEADLINE_APPROACHING");
    expect(computeReminders([t], DEFAULT_SETTINGS, new Date("2026-11-20T03:00:00Z"))[0].type).toBe("OVERDUE");
  });
});
