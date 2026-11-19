import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { blockerStats, createdInRange, distribution, resolveRange, series, summarize, trendSeries, type AnalyticsTask } from "@/lib/analytics";
import { BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, BACKUP_TABLES, emptyIndex, normRow, planRestore, reviveRow, validateBackup, type BackupFile } from "@/lib/backup-meta";
import { toCsv } from "@/lib/csv";
import { formatDate, formatDateAs, formatDateTime, setDateFormat } from "@/lib/dates";
import { parseQuickCapture } from "@/lib/quick-parse";
import { makeSnippet } from "@/lib/search-util";
import { DEFAULT_SETTINGS, mergeSettings } from "@/lib/settings";

const now = new Date("2026-11-19T03:00:00Z"); // Thu 19 Nov 2026, 10:00 Jakarta

describe("Quick Capture parser", () => {
  const p = (s: string) => parseQuickCapture(s, now);
  it("the example from the spec", () => {
    const r = p("Follow up with engineering about the API issue tomorrow.");
    expect(r).toMatchObject({ title: "Follow up with engineering about the API issue", category: "Stakeholder Follow-up", followUpDate: "2026-11-20", nextAction: "Follow up with engineering about the API issue" });
    expect(r.dueDate).toBeUndefined();
  });
  it("weekday, priority and tags; due date for non-follow-up work", () => {
    expect(p("UAT retest booking by Friday #uat urgent")).toMatchObject({ title: "UAT retest booking", category: "UAT / QA", priority: "High", dueDate: "2026-11-20", tags: ["uat"] });
    expect(p("critical: fix login bug today")).toMatchObject({ priority: "Critical", dueDate: "2026-11-19", category: "Bug Investigation" });
  });
  it("relative dates", () => {
    expect(p("Meeting with finance next week")).toMatchObject({ dueDate: "2026-11-23", category: "Meeting" });
    expect(p("send report in 3 days").dueDate).toBe("2026-11-22");
    expect(p("call vendor friday").dueDate).toBe("2026-11-20");
    expect(p("call vendor next friday").dueDate).toBe("2026-11-27");
    expect(p("call vendor next monday").dueDate).toBe("2026-11-23");
    expect(p("review spec lusa").dueDate).toBe("2026-11-21");
  });
  it("absolute dates; past dates roll to next year", () => {
    expect(p("Write PRD on 25 Nov")).toMatchObject({ title: "Write PRD", dueDate: "2026-11-25", category: "Documentation" });
    expect(p("ship it 2026-12-01").dueDate).toBe("2026-12-01");
    expect(p("renew licence 5 Nov").dueDate).toBe("2027-11-05");
    expect(p("pay invoice 31/12").dueDate).toBe("2026-12-31");
  });
  it("Indonesian phrases", () => {
    expect(p("Besok tanya Andi soal timestamp")).toMatchObject({ title: "Tanya Andi soal timestamp", followUpDate: "2026-11-20", category: "Stakeholder Follow-up" });
    expect(p("rapat dengan tim minggu depan").dueDate).toBe("2026-11-23");
  });
  it("empty and plain input", () => {
    expect(p("   ")).toMatchObject({ title: "", tags: [] });
    expect(p("Buy coffee")).toMatchObject({ title: "Buy coffee", tags: [] });
  });
});

describe("analytics", () => {
  const T = (id: string, created: string, completed: string | null, o: Partial<AnalyticsTask> = {}): AnalyticsTask => ({
    id, status: completed ? "Done" : "To Do", priority: "Medium", category: "Other", projectId: null, dueDate: null,
    createdAt: new Date(`${created}T05:00:00Z`), completedAt: completed ? new Date(`${completed}T05:00:00Z`) : null, ...o,
  });
  const r = { from: "2026-11-01", to: "2026-11-19" };
  const tasks = [
    T("a", "2026-11-02", "2026-11-04"), T("b", "2026-11-03", "2026-11-09"), T("c", "2026-11-10", null, { dueDate: new Date("2026-11-15T00:00:00+07:00") }),
    T("d", "2026-10-20", "2026-11-05"), T("e", "2026-11-12", null, { status: "Cancelled" }),
  ];
  it("summary uses the stated definitions", () => {
    const s = summarize(tasks, r, now);
    expect(s.totalCreated).toBe(4); // a, b, c, e (d was created in October)
    expect(s.totalCompleted).toBe(3); // a, b, d completed in range
    expect(s.completionRate).toBe(67); // cohort a,b,c (cancelled excluded): 2 of 3 done
    expect(s.avgCompletionDays).toBe(8); // (2 + 6 + 16) / 3
    expect(s.overdue).toBe(1);
    expect(s.open).toBe(1);
  });
  it("ranges", () => {
    expect(resolveRange({}, "2026-11-19")).toEqual({ range: "30d", from: "2026-10-21", to: "2026-11-19" });
    expect(resolveRange({ range: "7d" }, "2026-11-19").from).toBe("2026-11-13");
    expect(resolveRange({ range: "year" }, "2026-11-19").from).toBe("2026-01-01");
    expect(resolveRange({ range: "all" }, "2026-11-19", "2026-03-01").from).toBe("2026-03-01");
    expect(resolveRange({ from: "2026-11-05", to: "2026-11-01" }, "2026-11-19").range).toBe("30d"); // reversed -> ignored
    expect(resolveRange({ from: "2026-11-01", to: "2026-11-05" }, "2026-11-19")).toMatchObject({ range: "custom" });
  });
  it("series granularity follows the range length and counts every task once", () => {
    const t = trendSeries(tasks, r);
    expect(t.granularity).toBe("day");
    expect(t.points).toHaveLength(19);
    expect(t.points.reduce((n, p) => n + p.created, 0)).toBe(4);
    expect(t.points.reduce((n, p) => n + p.completed, 0)).toBe(3);
    expect(trendSeries(tasks, { from: "2026-05-01", to: "2026-11-19" }).granularity).toBe("month");
    expect(series(tasks, r, "week").map((p) => p.completed).reduce((a, b) => a + b, 0)).toBe(3);
  });
  it("distributions are over the created cohort and honour a fixed order", () => {
    const cohort = createdInRange(tasks, r);
    expect(distribution(cohort, (t) => t.status)).toEqual([{ name: "Done", value: 2 }, { name: "Cancelled", value: 1 }, { name: "To Do", value: 1 }].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)));
    expect(distribution(cohort, (t) => t.priority, ["Critical", "High", "Medium", "Low"])).toEqual([{ name: "Medium", value: 4 }]);
  });
  it("blocker durations pair added/resolved events and track ongoing blockers", () => {
    const ev = (taskId: string, type: string, d: string) => ({ taskId, type, createdAt: new Date(`${d}T00:00:00Z`) });
    const s = blockerStats([
      ev("t1", "BLOCKER_ADDED", "2026-11-01"), ev("t1", "BLOCKER_RESOLVED", "2026-11-05"),
      ev("t2", "BLOCKER_ADDED", "2026-11-02"), ev("t2", "BLOCKER_RESOLVED", "2026-11-04"),
      ev("t3", "BLOCKER_ADDED", "2026-11-10"), { taskId: null, type: "BLOCKER_ADDED", createdAt: now },
    ], r, now);
    expect(s).toMatchObject({ avgDays: 3, resolvedCount: 2, ongoingCount: 1 });
    expect(s.longestOngoingDays).toBeGreaterThanOrEqual(8);
    expect(blockerStats([], r, now)).toMatchObject({ avgDays: null, resolvedCount: 0 });
  });
});

describe("CSV export safety", () => {
  it("quotes properly and neutralises spreadsheet formulas", () => {
    const csv = toCsv([{ a: 'He said "hi", ok', b: "=HYPERLINK(\"http://x\")", c: "+1", d: -5, e: null, f: new Date("2026-11-19T00:00:00Z"), g: "line1\nline2" }], ["a", "b", "c", "d", "e", "f", "g"]);
    const [head, row] = csv.split("\r\n");
    expect(head).toBe("a,b,c,d,e,f,g");
    expect(row.startsWith('"He said ""hi"", ok",')).toBe(true);
    expect(row).toContain("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(row).toContain(",'+1,");
    expect(row).toContain(",-5,"); // real numbers are untouched
    expect(row).toContain("2026-11-19T00:00:00.000Z");
    expect(row.endsWith('"line1\nline2"')).toBe(true);
  });
});

describe("search snippets", () => {
  it("highlights the first case-insensitive match with context", () => {
    expect(makeSnippet("Waiting for the BACKEND team to fix the timestamp", "backend", 8)).toEqual({ before: "…for the ", match: "BACKEND", after: " team to…" });
    expect(makeSnippet("nothing here", "zzz")).toBeNull();
    expect(makeSnippet(null, "a")).toBeNull();
  });
});

describe("date display format setting", () => {
  afterEach(() => setDateFormat("dd MMM yyyy"));
  it("formats in each supported style", () => {
    expect(formatDateAs(now, "dd MMM yyyy")).toBe("19 Nov 2026");
    expect(formatDateAs(now, "yyyy-MM-dd")).toBe("2026-11-19");
    expect(formatDateAs(now, "dd/MM/yyyy")).toBe("19/11/2026");
    expect(formatDateAs(now, "MM/dd/yyyy")).toBe("11/19/2026");
  });
  it("formatDate / formatDateTime follow the active setting", () => {
    expect(formatDate(now)).toBe("19 Nov 2026");
    expect(formatDateTime(now)).toBe("19 Nov, 10:00");
    setDateFormat("dd/MM/yyyy");
    expect(formatDate(now)).toBe("19/11/2026");
    expect(formatDateTime(now)).toBe("19/11/2026 10:00");
    expect(formatDate(null)).toBe("—");
  });
});

describe("settings", () => {
  it("older stored settings gain the new fields with defaults; bad values fall back safely", () => {
    const old = mergeSettings({ inactivityDays: 5, weights: { deadline: 50 } });
    expect(old.inactivityDays).toBe(5);
    expect(old.weights.deadline).toBe(50);
    expect(old.dateFormat).toBe("dd MMM yyyy");
    expect(old.autoBackup).toBe(true);
    expect(mergeSettings({ dateFormat: "banana" })).toEqual(DEFAULT_SETTINGS);
  });
});

describe("backup format matches the Prisma schema", () => {
  const schema = fs.readFileSync(path.resolve("prisma/schema.prisma"), "utf8");
  const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => ({ name: m[1], body: m[2] }));
  it("every model is backed up, and nothing extra", () => {
    expect(BACKUP_TABLES.map((t) => t.name).sort()).toEqual(models.map((m) => m.name).sort());
  });
  it("DateTime columns, composite keys and foreign keys are all described", () => {
    for (const m of models) {
      const meta = BACKUP_TABLES.find((t) => t.name === m.name)!;
      const dates = [...m.body.matchAll(/^\s+(\w+)\s+DateTime\??/gm)].map((x) => x[1]).sort();
      expect([m.name, [...meta.dates].sort()]).toEqual([m.name, dates]);
      const pk = m.body.match(/@@id\(\[(.*?)\]\)/)?.[1].split(",").map((s) => s.trim());
      expect(meta.pk).toEqual(pk);
      const fks = [...m.body.matchAll(/@relation\([^)]*fields:\s*\[(\w+)\]/g)].map((x) => x[1]).sort();
      expect([m.name, meta.refs.map((r) => r.field).sort()]).toEqual([m.name, fks]);
    }
  });
  it("parents are listed before their children", () => {
    const order = new Map(BACKUP_TABLES.map((t, i) => [t.name, i]));
    for (const t of BACKUP_TABLES) for (const r of t.refs) expect(order.get(r.table)!).toBeLessThan(order.get(t.name)!);
  });
});

describe("backup validation and restore planning", () => {
  const backup = (data: BackupFile["data"], extra: Partial<BackupFile> = {}): BackupFile => ({ format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, data, ...extra });
  const iso = "2026-11-19T03:00:00.000Z";
  const task = (id: string, seq: number, o = {}) => ({ id, seq, title: id, category: "Other", priority: "Medium", status: "To Do", progress: 0, businessImportance: 3, projectId: null, createdAt: iso, updatedAt: iso, ...o });

  it("rejects things that are not usable backups, with a clear reason", () => {
    expect(validateBackup("x").error).toMatch(/not a TaskPilot backup/);
    expect(validateBackup({ format: "other", schemaVersion: 1, data: {} }).error).toMatch(/missing format marker/);
    expect(validateBackup({ format: BACKUP_FORMAT, data: {} }).error).toMatch(/schema version/);
    expect(validateBackup({ format: BACKUP_FORMAT, schemaVersion: 99, data: {} }).error).toMatch(/newer TaskPilot/);
    expect(validateBackup(backup({ Task: [{ title: "no id" }] })).error).toMatch(/missing its "id"/);
    expect(validateBackup(backup({ Task: "nope" as never })).error).toMatch(/not a list/);
    const ok = validateBackup(backup({ Task: [task("t1", 1)], Mystery: [] }));
    expect(ok.error).toBeNull();
    expect(ok.warnings[0]).toMatch(/Unknown table "Mystery"/);
  });
  it("revives dates and rejects invalid ones", () => {
    const meta = BACKUP_TABLES.find((t) => t.name === "Task")!;
    const r = reviveRow(meta, { id: "x", createdAt: iso, dueDate: null });
    expect(r.createdAt).toBeInstanceOf(Date);
    expect(r.dueDate).toBeNull();
    expect(() => reviveRow(meta, { id: "x", createdAt: "not a date" })).toThrow(/invalid date/);
  });
  it("merge into an empty database inserts everything in order", () => {
    const plan = planRestore(backup({ Project: [{ id: "p1", name: "P", createdAt: iso, updatedAt: iso }], Task: [task("t1", 1, { projectId: "p1" })], Subtask: [{ id: "s1", taskId: "t1", title: "s", createdAt: iso, updatedAt: iso }] }), emptyIndex(), "merge");
    expect(plan.tables.filter((t) => t.insert.length).map((t) => [t.table, t.insert.length])).toEqual([["Project", 1], ["Task", 1], ["Subtask", 1]]);
  });
  it("merge never overwrites: identical rows are counted, changed rows are kept as they are", () => {
    const idx = emptyIndex();
    const same = reviveRow(BACKUP_TABLES.find((t) => t.name === "Task")!, task("t1", 1));
    idx.rows.Task = new Map([["t1", normRow(same)], ["t2", normRow({ ...same, id: "t2", title: "changed locally" })]]);
    idx.taskSeq = new Map([[1, "t1"], [2, "t2"]]);
    idx.maxTaskSeq = 2;
    const plan = planRestore(backup({ Task: [task("t1", 1), task("t2", 2)] }), idx, "merge");
    const tp = plan.tables.find((t) => t.table === "Task")!;
    expect(tp).toMatchObject({ identical: 1, differs: 1 });
    expect(tp.insert).toHaveLength(0);
  });
  it("renumbers colliding task and issue numbers instead of failing", () => {
    const idx = emptyIndex();
    idx.taskSeq = new Map([[1, "mine"], [2, "mine2"]]);
    idx.maxTaskSeq = 2;
    const plan = planRestore(backup({ Task: [task("t1", 1), task("t9", 7)] }), idx, "merge");
    const seqs = plan.tables.find((t) => t.table === "Task")!.insert.map((r) => r.seq);
    expect(seqs[0]).toBeGreaterThan(7); // collided with an existing number -> moved past everything in use
    expect(seqs[1]).toBe(7); // no collision -> keeps its number
    expect(plan.renumbered.tasks).toBe(1);
  });
  it("merges tags by name and remaps task-tag links; skips duplicates created by the remap", () => {
    const idx = emptyIndex();
    idx.rows.Task = new Map([["t1", "x"]]);
    idx.rows.Tag = new Map([["tag-mine", "x"]]);
    idx.tagByName = new Map([["uat", "tag-mine"]]);
    idx.rows.TaskTag = new Map([["t1:tag-mine", "x"]]);
    const plan = planRestore(backup({ Tag: [{ id: "tag-b", name: "uat", createdAt: iso }, { id: "tag-c", name: "new", createdAt: iso }], TaskTag: [{ taskId: "t1", tagId: "tag-b" }, { taskId: "t1", tagId: "tag-c" }] }), idx, "merge");
    expect(plan.tagRemap.get("tag-b")).toBe("tag-mine");
    expect(plan.tables.find((t) => t.table === "Tag")!.insert.map((r) => r.id)).toEqual(["tag-c"]);
    expect(plan.tables.find((t) => t.table === "TaskTag")!.insert).toEqual([{ taskId: "t1", tagId: "tag-c" }]);
  });
  it("skips orphans, clears optional links, drops duplicates and keeps your settings", () => {
    const idx = emptyIndex();
    idx.prefKeys = new Set(["settings.engine"]);
    const plan = planRestore(backup({
      UserPreference: [{ id: "u1", key: "settings.engine", value: "{}", createdAt: iso, updatedAt: iso }, { id: "u2", key: "other", value: "1", createdAt: iso, updatedAt: iso }],
      Task: [task("t1", 1, { projectId: "ghost" }), task("t1", 2)],
      Subtask: [{ id: "s1", taskId: "ghost", title: "orphan", createdAt: iso, updatedAt: iso }],
    }), idx, "merge");
    const by = (n: string) => plan.tables.find((t) => t.table === n)!;
    expect(by("UserPreference").insert.map((r) => r.key)).toEqual(["other"]);
    expect(by("Task").insert).toHaveLength(1);
    expect(by("Task").insert[0].projectId).toBeNull();
    expect(by("Task").skipped["duplicate record in the backup"]).toBe(1);
    expect(by("Subtask").skipped["its parent record is missing"]).toBe(1);
    expect(plan.warnings.some((w) => w.includes("link was cleared"))).toBe(true);
  });
});
