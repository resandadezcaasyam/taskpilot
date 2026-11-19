import fs from "node:fs";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { applyMigrations, tmp } from "./helpers";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
/* eslint-disable @typescript-eslint/no-explicit-any */
const dbFile = tmp("phase4.db");
const uploads = tmp("uploads-p4");
const backups = tmp("backups-p4");
let T: any, P: any, U: any, I: any, A: any, PL: any, E: any, DP: any, ST: any, BK: any, BM: any, BA: any, EX: any, AN: any, SR: any, ED: any, D: any, dbm: any, REM: any;
let routes: { export: any; backup: any; backups: any };
const ids: Record<string, string> = {};
const png = (name = "shot.png", type = "image/png", bytes = [137, 80, 78, 71, 1, 2, 3]) => { const fd = new FormData(); fd.set("file", new File([new Uint8Array(bytes)], name, { type })); return fd; };
const base = { description: "", projectId: "", category: "Other", priority: "Medium", status: "To Do", startDate: "", dueDate: "", assignee: "", stakeholder: "", estimatedHours: "", actualHours: "", progress: "0", businessImportance: "3", nextAction: "", nextActionDue: "", blockerDescription: "", waitingFor: "", followUpDate: "", tags: "", notes: "" };
const issueBase = { title: "x", description: "", projectId: "", category: "Bug", severity: "High", reportedBy: "", responsiblePic: "", reportedDate: "", rootCause: "", impact: "", workaround: "", expectedResolution: "", nextFollowUpDate: "" };
const uatBase = { name: "Booking", projectId: "", releaseVersion: "v2.4", environment: "Staging", owner: "Sari", startDate: "", targetDate: "", status: "In Progress", signOffStatus: "Pending", remarks: "", manualTotal: "", manualPassed: "", manualFailed: "", manualBlocked: "" };
const today = () => D.dateKey(new Date());

async function snap() {
  const out: Record<string, string[]> = {};
  for (const t of BM.BACKUP_TABLES) {
    const rows = await (dbm.db as any)[t.delegate].findMany();
    out[t.name] = rows.map((r: any) => `${BM.rowKey(t, r)}=${BM.normRow(r)}`).sort();
  }
  return out;
}
const counts = (s: Record<string, string[]>) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.length]));

beforeAll(async () => {
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
  fs.rmSync(uploads, { recursive: true, force: true });
  fs.rmSync(backups, { recursive: true, force: true });
  applyMigrations(dbFile);
  Object.assign(process.env, { DATABASE_URL: `file:${dbFile}`, UPLOADS_DIR: uploads, BACKUPS_DIR: backups });
  T = await import("../../src/actions/tasks"); P = await import("../../src/actions/projects"); U = await import("../../src/actions/uat");
  I = await import("../../src/actions/issues"); A = await import("../../src/actions/attachments"); PL = await import("../../src/actions/planner");
  E = await import("../../src/actions/engine"); DP = await import("../../src/actions/deps"); ST = await import("../../src/actions/settings");
  BA = await import("../../src/actions/backup"); REM = await import("../../src/actions/reminders");
  BK = await import("../../src/lib/backup"); BM = await import("../../src/lib/backup-meta"); EX = await import("../../src/lib/export");
  AN = await import("../../src/lib/analytics-data"); SR = await import("../../src/lib/search"); ED = await import("../../src/lib/engine-data");
  D = await import("../../src/lib/dates"); dbm = await import("../../src/lib/db");
  routes = { export: await import("../../src/app/api/export/[entity]/route"), backup: await import("../../src/app/api/backup/route"), backups: await import("../../src/app/api/backups/[name]/route") };
});

describe("seed a realistic workspace", () => {
  it("creates linked data of every kind", async () => {
    const proj = await P.createProject({ name: "Booking Revamp", description: "", owner: "Resanda", category: "", priority: "High", status: "Active", startDate: "", targetDate: "", risks: "Vendor delay risk", notes: "" });
    ids.p = proj.data.id;
    const mk = async (k: string, o: object) => { const r = await T.createTask({ ...base, projectId: ids.p, ...o }); expect(r.ok, JSON.stringify(r)).toBe(true); ids[k] = r.data.id; };
    await mk("t1", { title: "Vendor compliance", tags: "uat, zeta", stakeholder: "Budi Santoso", notes: "needs sign-off from finance", dueDate: today(), estimatedHours: "2" });
    await mk("t2", { title: "Timestamp bug", status: "Blocked", blockerDescription: "Backend timestamp missing", waitingFor: "Engineering" });
    await mk("t3", { title: "Write release notes", tags: "zeta", priority: "Low" });
    await mk("t4", { title: "Shipped feature", status: "Done" });
    await T.setTaskStatus(ids.t2, "In Progress"); // blocker added then resolved -> activity events
    await T.addComment(ids.t1, "Waiting for the BACKEND team");
    await T.addSubtask(ids.t3, "Draft outline"); await T.addComment(ids.t3, "First draft done");
    expect((await DP.addDependency(ids.t2, ids.t1)).ok).toBe(true);
    expect((await A.addTaskAttachment(ids.t1, png("spec.pdf", "application/pdf"))).ok).toBe(true);
    const f = await U.createUatFeature({ ...uatBase, projectId: ids.p, targetDate: today() });
    ids.f = f.data.id;
    const csv = "Title,Steps,Expected Result,Result\nOpen booking,1. open,Shown,Pass\nPay,2. pay,Paid,Fail\nCancel,3. cancel,Refund,Not Run";
    const BM2 = await import("../../src/lib/csv");
    await U.importTestCases(ids.f, BM2.mapTestCaseRows(BM2.parseCsv(csv)).cases);
    const cases = await dbm.db.uatTestCase.findMany({ orderBy: { position: "asc" } });
    expect((await A.addEvidence(cases[1].id, png("fail.png"))).ok).toBe(true);
    ids.iss = (await U.createIssueFromTestCase(cases[1].id)).data.issueId;
    const i2 = await I.createIssue({ ...issueBase, title: "Fare mismatch", projectId: ids.p, reportedBy: "Sari Wulandari", reportedDate: today(), nextFollowUpDate: today() });
    ids.i2 = i2.data.id;
    const fd = png("trace.png"); fd.set("message", "Reproduced on staging"); fd.set("nextFollowUp", "");
    expect((await I.postIssueUpdate(ids.i2, fd)).ok).toBe(true);
    expect((await I.escalateIssue(ids.i2, { to: "Backend team", reason: "load", followUpDate: "" })).ok).toBe(true);
    await P.addMilestone(ids.p, "Beta", today());
    await PL.addToPlan(ids.t1); await PL.saveDailyNote(today(), "Call finance about sign-off");
    expect((await E.overrideNextAction(ids.t3, { text: "Ask Sari for the template", pinned: false })).ok).toBe(true);
    expect((await ST.saveEngineSettings({ ...(await ED.getSettings()), displayName: "Resanda", dateFormat: "yyyy-MM-dd" })).ok).toBe(true);
    await ED.syncReminders();
    const s = counts(await snap());
    expect(s.Task).toBe(4); expect(s.Issue).toBe(2); expect(s.UatTestCase).toBe(3); expect(s.TaskAttachment).toBe(1); expect(s.UatEvidence).toBe(1);
    expect(s.IssueUpdate).toBeGreaterThanOrEqual(3); expect(s.Reminder).toBeGreaterThan(0); expect(s.PlanItem).toBe(1);
  });
});

describe("analytics, search and exports read the real data", () => {
  it("analytics matches the database", async () => {
    const a = await AN.getAnalytics({ range: "30d" });
    expect(a.summary.totalCreated).toBe(4);
    expect(a.summary.totalCompleted).toBe(1);
    expect(a.summary.completionRate).toBe(25);
    expect(a.byStatus.reduce((n: number, s: any) => n + s.value, 0)).toBe(4);
    expect(a.byPriority.map((p: any) => p.name)).toEqual(["High", "Medium", "Low"].filter((n) => a.byPriority.some((p: any) => p.name === n)).sort((x: string, y: string) => ["Critical", "High", "Medium", "Low"].indexOf(x) - ["Critical", "High", "Medium", "Low"].indexOf(y)));
    expect(a.byProject).toEqual([{ name: "Booking Revamp", value: 4 }]);
    expect(a.blockers).toMatchObject({ resolvedCount: 1, ongoingCount: 0 });
    expect(a.projectProgress[0].name).toBe("Booking Revamp");
    expect(a.uatExecution[0]).toMatchObject({ name: "Booking", passed: 1, failed: 1, notRun: 1 });
    expect(a.trend.points.reduce((n: number, p: any) => n + p.created, 0)).toBe(4);
    const old = await AN.getAnalytics({ from: "2020-01-01", to: "2020-01-31" });
    expect(old.summary).toMatchObject({ totalCreated: 0, totalCompleted: 0, completionRate: null });
  });

  it("global search covers tasks, notes, stakeholders, tags, UAT, issues and handles wildcard characters", async () => {
    const hit = async (q: string) => await SR.globalSearch(q);
    expect((await hit("vendor")).tasks.items.map((i: any) => i.title)).toContain("Vendor compliance");
    expect((await hit("backend")).notes.items.some((i: any) => i.subtitle.includes("comment") && i.snippet?.match.toLowerCase() === "backend")).toBe(true);
    expect((await hit("budi")).people.items[0]).toMatchObject({ title: "Budi Santoso", subtitle: "1 task" });
    expect((await hit("zeta")).tags.items[0]).toMatchObject({ title: "#zeta", subtitle: "2 tasks" });
    expect((await hit("2. pay")).uat.items.some((i: any) => i.subtitle.startsWith("Test case"))).toBe(true);
    expect((await hit("reproduced")).notes.items[0].href).toBe(`/issues/${ids.i2}`);
    expect((await hit("finance")).notes.items.map((i: any) => i.href)).toEqual(expect.arrayContaining([`/tasks/${ids.t1}`, "/today"]));
    expect((await hit("sari")).people.items.map((i: any) => i.title)).toEqual(expect.arrayContaining(["Sari Wulandari"]));
    expect((await hit("vendor delay")).notes.items[0].href).toBe(`/projects/${ids.p}`); // project risks
    const wild = await hit("%%");
    expect(Object.values(wild).reduce((n: number, g: any) => n + g.items.length, 0)).toBe(0);
  });

  it("every export works in CSV and JSON, and CSV is safe to open in a spreadsheet", async () => {
    await T.createTask({ ...base, title: "=HYPERLINK(\"http://evil\",\"x\")", notes: "line1\nline2, with comma" });
    for (const e of EX.EXPORT_ENTITIES) {
      const csv = await EX.exportEntity(e, "csv");
      expect(csv.filename).toMatch(new RegExp(`^taskpilot-${e}-\\d{4}-\\d{2}-\\d{2}\\.csv$`));
      expect(csv.body.startsWith("\uFEFF")).toBe(true);
      const json = JSON.parse((await EX.exportEntity(e, "json")).body);
      expect(json.entity).toBe(e);
      expect(json.items.length).toBe(json.count);
    }
    const tasks = (await EX.exportEntity("tasks", "csv")).body;
    expect(tasks).toContain("Task ID,Title,Description,Project");
    expect(tasks).toContain("\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\")\""); // neutralised formula
    expect(tasks).toContain("\"line1\nline2, with comma\"");
    expect(tasks).toContain("Vendor compliance");
    const tcs = (await EX.exportEntity("uat-test-cases", "csv")).body;
    const { mapTestCaseRows, parseCsv } = await import("../../src/lib/csv");
    expect(mapTestCaseRows(parseCsv(tcs.slice(1))).cases.map((c: any) => c.title)).toEqual(["Open booking", "Pay", "Cancel"]); // re-importable
    expect(JSON.parse((await EX.exportEntity("tasks", "json")).body).items.find((t: any) => t.code === "TP-0001").tags.sort()).toEqual(["uat", "zeta"]);
    await dbm.db.task.deleteMany({ where: { title: { startsWith: "=HYPER" } } });
    const ok = await routes.export.GET(new Request("http://x/api/export/issues?format=json"), { params: Promise.resolve({ entity: "issues" }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toContain("attachment");
    expect((await routes.export.GET(new Request("http://x"), { params: Promise.resolve({ entity: "secrets" }) })).status).toBe(404);
  });
});

describe("backup and restore", () => {
  let zip: Uint8Array;
  let S0: Record<string, string[]>;

  it("a full backup contains every table; the ZIP also carries the files", async () => {
    S0 = await snap();
    const json = await BK.backupToBytes(false);
    const parsedJson = BK.parseBackupBytes(json.bytes);
    expect(parsedJson.backup.counts).toEqual(counts(S0));
    expect(Object.keys(parsedJson.backup.data).sort()).toEqual(BM.BACKUP_TABLES.map((t: any) => t.name).sort());
    const z = await BK.backupToBytes(true);
    zip = z.bytes;
    expect(z.ext).toBe("zip");
    expect(z.missingFiles).toBe(0);
    const parsedZip = BK.parseBackupBytes(zip);
    expect(parsedZip.files.size).toBe(3); // task attachment, evidence, issue screenshot
    expect(parsedZip.backup.files.every((f: any) => f.included)).toBe(true);
    const viaRoute = await routes.backup.GET(new Request("http://x/api/backup?files=1"));
    expect(viaRoute.headers.get("content-type")).toBe("application/zip");
  });

  it("merge restore of the same backup is a no-op (idempotent)", async () => {
    const parsed = BK.parseBackupBytes(zip);
    const report = await BK.analyzeRestore(parsed, "merge");
    expect(report.totals).toMatchObject({ toAdd: 0, differs: 0, skipped: 0 });
    expect(report.totals.identical).toBe(report.totals.inBackup);
    const res = await BK.applyRestore(parsed, "merge");
    expect(res.totalInserted).toBe(0);
    expect(await snap()).toEqual(S0);
  });

  it("merge brings back what was lost, keeps local edits, and never duplicates", async () => {
    await T.deleteTask(ids.t3); // had a subtask, a comment, a tag and an override
    await dbm.db.task.update({ where: { id: ids.t1 }, data: { title: "Vendor compliance (edited locally)" } });
    const t3 = (JSON.parse(JSON.stringify(S0.Task.find((r) => r.includes("Write release notes")))) as string);
    const oldSeq = Number(JSON.parse(t3.slice(t3.indexOf("=") + 1)).find((kv: any) => kv[0] === "seq")[1]);
    const local = await dbm.db.task.create({ data: { seq: oldSeq, title: "Local task that took that number" } }); // collides with t3's number
    const parsed = BK.parseBackupBytes(zip);
    const report = await BK.analyzeRestore(parsed, "merge");
    expect(report.renumbered.tasks).toBe(1);
    expect(report.totals.differs).toBeGreaterThanOrEqual(1);
    const before = counts(await snap());
    const res = await BK.applyRestore(parsed, "merge");
    expect(res.renumbered.tasks).toBe(1);
    expect(res.inserted.Task).toBe(1);
    const after = counts(await snap());
    expect(after.Task).toBe(before.Task + 1);
    expect(after.Subtask).toBe(1);
    expect(after.TaskComment).toBe(S0.TaskComment.length);
    expect(after.NextAction).toBe(S0.NextAction.length);
    expect(after.Tag).toBe(S0.Tag.length); // existing tag reused, not duplicated
    expect(after.TaskTag).toBe(S0.TaskTag.length);
    expect((await dbm.db.task.findUniqueOrThrow({ where: { id: ids.t1 } })).title).toBe("Vendor compliance (edited locally)");
    expect((await dbm.db.task.findUniqueOrThrow({ where: { id: ids.t3 } })).seq).not.toBe(oldSeq);
    expect((await dbm.db.task.findUniqueOrThrow({ where: { id: local.id } })).seq).toBe(oldSeq);
    const seqs = (await dbm.db.task.findMany()).map((t: any) => t.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(Number((await dbm.db.userPreference.findUnique({ where: { key: "counter:task" } })).value)).toBeGreaterThanOrEqual(Math.max(...seqs));
    expect(fs.readdirSync(backups).some((f) => f.startsWith("pre-restore-"))).toBe(true); // safety snapshot
    await dbm.db.task.delete({ where: { id: local.id } });
    await dbm.db.task.update({ where: { id: ids.t1 }, data: { title: "Vendor compliance" } });
  });

  it("replace restores everything exactly, including files that were lost", async () => {
    const ev = await dbm.db.uatEvidence.findFirstOrThrow();
    const taskFile = (await dbm.db.taskAttachment.findFirstOrThrow()).filePath;
    fs.unlinkSync(path.join(uploads, ev.filePath)); // files lost
    fs.unlinkSync(path.join(uploads, taskFile));
    await dbm.db.project.update({ where: { id: ids.p }, data: { name: "Renamed" } });
    await dbm.db.task.deleteMany({ where: { status: "Done" } });
    await dbm.db.issue.create({ data: { seq: 99, title: "Extra issue" } });
    const parsed = BK.parseBackupBytes(zip);
    const report = await BK.analyzeRestore(parsed, "replace");
    expect(report.existingRecords).toBeGreaterThan(0);
    expect(report.totals.toAdd).toBe(report.totals.inBackup);
    const noConfirm = new FormData(); noConfirm.set("file", new File([zip as BlobPart], "b.zip")); noConfirm.set("mode", "replace");
    expect((await BA.restoreBackup(noConfirm)).ok).toBe(false);
    noConfirm.set("confirm", "replace");
    expect((await BA.restoreBackup(noConfirm)).error).toMatch(/Type REPLACE/);
    expect((await dbm.db.project.findUniqueOrThrow({ where: { id: ids.p } })).name).toBe("Renamed"); // nothing changed yet
    noConfirm.set("confirm", "REPLACE");
    const res = await BA.restoreBackup(noConfirm);
    expect(res.ok, JSON.stringify(res)).toBe(true);
    expect(res.data.filesRestored).toBe(2);
    expect(await snap()).toEqual(S0);
    expect(fs.existsSync(path.join(uploads, ev.filePath))).toBe(true);
    expect(fs.existsSync(path.join(uploads, taskFile))).toBe(true);
    const snapName = res.data.snapshot;
    const pre = JSON.parse(fs.readFileSync(path.join(backups, snapName), "utf8"));
    expect(pre.data.Project[0].name).toBe("Renamed"); // the safety snapshot holds the state before the restore
    const next = await T.createTask({ ...base, title: "After restore" });
    const maxSeq = Math.max(...(await dbm.db.task.findMany()).map((t: any) => t.seq));
    expect((await dbm.db.task.findUniqueOrThrow({ where: { id: next.data.id } })).seq).toBe(maxSeq);
    await dbm.db.task.delete({ where: { id: next.data.id } });
    S0 = await snap(); // creating a task legitimately advanced the numbering counter, so compare against this state from here on
  });

  it("unusable files are rejected with a clear reason and change nothing", async () => {
    const parse = (b: Uint8Array) => () => BK.parseBackupBytes(b);
    expect(parse(new Uint8Array())).toThrow(/empty/);
    expect(parse(strToU8("hello world"))).toThrow(/could not be read as JSON/);
    expect(parse(strToU8('{"a":1}'))).toThrow(/missing format marker/);
    expect(parse(strToU8('{"format":"taskpilot-backup","schemaVersion":42,"data":{}}'))).toThrow(/newer TaskPilot/);
    expect(parse(strToU8('{"format":"taskpilot-backup","schemaVersion":1,"data":{"Task":[{"title":"x"}]}}'))).toThrow(/missing its "id"/);
    expect(parse(zipSync({ "notes.txt": strToU8("x") }))).toThrow(/does not contain backup.json/);
    expect(parse(new Uint8Array([0x50, 0x4b, 1, 2, 3, 4]))).toThrow(/damaged/);
    expect(parse(zip.slice(0, 200))).toThrow(); // truncated download
    const fd = new FormData(); fd.set("file", new File(["garbage"], "x.json")); fd.set("mode", "merge");
    const r = await BA.previewRestore(fd);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/JSON/);
    expect((await BA.previewRestore(new FormData())).ok).toBe(false);
    expect(await snap()).toEqual(S0);
  });

  it("a restore that fails halfway rolls back completely, even in replace mode", async () => {
    const parsed = BK.parseBackupBytes(zip);
    parsed.backup.data.Task.push({ id: "bad-row", seq: 9999, title: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await expect(BK.applyRestore(parsed, "replace")).rejects.toThrow();
    expect(await snap()).toEqual(S0); // nothing was deleted, nothing half-restored
    const merge = BK.parseBackupBytes(zip);
    merge.backup.data.Task.push({ id: "bad-row", seq: 9999, title: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await expect(BK.applyRestore(merge, "merge")).rejects.toThrow();
    expect(await snap()).toEqual(S0);
  });
});

describe("automatic backups, backup files and settings", () => {
  it("creates one automatic backup per day and prunes old ones", async () => {
    fs.rmSync(backups, { recursive: true, force: true });
    fs.mkdirSync(backups, { recursive: true });
    for (const d of ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]) fs.writeFileSync(path.join(backups, `auto-${d}.json`), "{}");
    fs.writeFileSync(path.join(backups, "backup-manual.json"), "{}");
    await ST.saveEngineSettings({ ...(await ED.getSettings()), autoBackup: true, autoBackupKeep: 2 });
    const now = new Date("2026-11-20T03:00:00Z");
    expect((await BK.maybeAutoBackup(now)).created).toBe(true);
    expect((await BK.maybeAutoBackup(now)).created).toBe(false); // already done today
    const names = fs.readdirSync(backups).sort();
    expect(names).toEqual(["auto-2026-10-04.json", "auto-2026-11-20.json", "backup-manual.json"]); // keeps 2 newest automatic, never touches manual ones
    expect(BK.parseBackupBytes(new Uint8Array(fs.readFileSync(path.join(backups, "auto-2026-11-20.json")))).backup.counts.Task).toBeGreaterThan(0);
    await ST.saveEngineSettings({ ...(await ED.getSettings()), autoBackup: false });
    expect((await BK.maybeAutoBackup(new Date("2026-11-21T03:00:00Z"))).created).toBe(false);
    expect(await BK.listBackupFiles()).toHaveLength(3);
    expect((await REM.refreshReminders()).ok).toBe(true);
  });

  it("backup downloads are restricted to the backups folder", async () => {
    const get = (name: string) => routes.backups.GET(new Request("http://x"), { params: Promise.resolve({ name }) });
    expect((await get("auto-2026-11-20.json")).status).toBe(200);
    for (const bad of ["../package.json", "..%2Fpackage.json", "x.txt", "a/b.json", ".."]) expect((await get(bad)).status).toBe(404);
    expect((await BA.removeBackupFile("../../package.json")).ok).toBe(false);
    expect((await BA.removeBackupFile("backup-manual.json")).ok).toBe(true);
    expect((await BA.createBackupNow(true)).data.name).toMatch(/^backup-\d{8}T\d{6}\.zip$/);
  });

  it("new settings persist, validate and survive a new connection", async () => {
    const s = await ED.getSettings();
    expect((await ST.saveEngineSettings({ ...s, dateFormat: "banana" as never })).ok).toBe(false);
    expect((await ST.saveEngineSettings({ ...s, autoBackupKeep: 0 })).ok).toBe(false);
    expect((await ST.saveEngineSettings({ ...s, displayName: "Resanda", theme: "dark", defaultTaskView: "cards", dashboardLayout: "projects", aiEnabled: true })).ok).toBe(true);
    expect((await ST.saveThemePreference("light")).ok).toBe(true);
    expect((await ST.saveThemePreference("neon")).ok).toBe(false);
    const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
    const { PrismaClient } = await import("../../src/generated/prisma/client");
    const fresh = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${dbFile}` }) });
    const stored = JSON.parse((await fresh.userPreference.findUnique({ where: { key: "settings.engine" } }))!.value);
    const tasks = await fresh.task.count();
    await fresh.$disconnect();
    expect(stored).toMatchObject({ displayName: "Resanda", theme: "light", defaultTaskView: "cards", dashboardLayout: "projects", aiEnabled: true, dateFormat: "yyyy-MM-dd" });
    expect(tasks).toBe(4);
  });
});
