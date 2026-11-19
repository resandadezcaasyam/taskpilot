import fs from "node:fs";
import path from "node:path";
import { applyMigrations, tmp } from "./helpers";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
/* eslint-disable @typescript-eslint/no-explicit-any */
const dbFile = tmp("phase3.db");
const uploads = tmp("uploads-test");
let U: any, I: any, C: any, A: any, T: any, R: any, D: any, ED: any, DM: any, UD: any, ID: any, CD: any, CSV: any, ROUTE: any, dbm: any;
const today = () => D.dateKey(new Date());
const shift = (n: number) => D.dateKey(D.addDays(D.startOfToday(), n));
const png = (name = "shot.png", type = "image/png") => { const fd = new FormData(); fd.set("file", new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], name, { type })); return fd; };

const base = { description: "", projectId: "", category: "Other", priority: "Medium", status: "To Do", startDate: "", dueDate: "", assignee: "", stakeholder: "", estimatedHours: "", actualHours: "", progress: "0", businessImportance: "3", nextAction: "", nextActionDue: "", blockerDescription: "", waitingFor: "", followUpDate: "", tags: "", notes: "" };
const uatBase = { name: "Booking", projectId: "", releaseVersion: "v2.4", environment: "Staging", owner: "Sari", startDate: "", targetDate: "", status: "In Progress", signOffStatus: "Pending", remarks: "", manualTotal: "", manualPassed: "", manualFailed: "", manualBlocked: "" };
const issueBase = { title: "API timeout", description: "", projectId: "", category: "Bug", severity: "High", reportedBy: "", responsiblePic: "", reportedDate: "", rootCause: "", impact: "", workaround: "", expectedResolution: "", nextFollowUpDate: "" };
const ids: Record<string, string> = {};

beforeAll(async () => {
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
  fs.rmSync(uploads, { recursive: true, force: true });
  applyMigrations(dbFile);
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.UPLOADS_DIR = uploads;
  U = await import("../../src/actions/uat"); I = await import("../../src/actions/issues"); C = await import("../../src/actions/calendar");
  A = await import("../../src/actions/attachments"); T = await import("../../src/actions/tasks"); R = await import("../../src/actions/reminders");
  D = await import("../../src/lib/dates"); ED = await import("../../src/lib/engine-data"); DM = await import("../../src/lib/queries");
  UD = await import("../../src/lib/uat-data"); ID = await import("../../src/lib/issue-data"); CD = await import("../../src/lib/calendar-data");
  CSV = await import("../../src/lib/csv"); ROUTE = await import("../../src/app/api/files/[kind]/[id]/route"); dbm = await import("../../src/lib/db");
});

describe("UAT tracker against real SQLite", () => {
  it("tracks manual counts until test cases exist, then the cases take over", async () => {
    const r = await U.createUatFeature({ ...uatBase, manualTotal: "20", manualPassed: "14", manualFailed: "2", manualBlocked: "1", targetDate: shift(2) });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    ids.f = r.data.id;
    let f = await UD.getUatFeature(ids.f);
    expect(f.source).toBe("manual");
    expect(f.counts).toMatchObject({ total: 20, passed: 14, failed: 2, blocked: 1, notRun: 3 });
    expect((await U.createUatFeature({ ...uatBase, manualPassed: "3" })).ok).toBe(false); // passed without total

    const csv = "Title;Steps;Expected Result;Result\nBook one-way;1. open;Issued;Pass\nBook return;2. open;Issued;Pass\nCancel booking;3. cancel;Refund;Fail\nChange seat;4. change;Seat moved;Blocked\nPrint ticket;5. print;PDF;";
    const parsed = CSV.mapTestCaseRows(CSV.parseCsv(csv));
    expect(parsed.errors).toEqual([]);
    const imp = await U.importTestCases(ids.f, parsed.cases);
    expect(imp.data).toEqual({ created: 5, skipped: 0 });
    expect((await U.importTestCases(ids.f, parsed.cases)).data).toEqual({ created: 0, skipped: 5 }); // idempotent
    f = await UD.getUatFeature(ids.f);
    expect(f.source).toBe("cases");
    expect(f.counts).toEqual({ total: 5, passed: 2, failed: 1, blocked: 1, notRun: 1 });
    expect(f.metrics).toMatchObject({ executionProgress: 60, passRate: 67, passedShare: 40, remaining: 2 });
    expect(f.actions[0].kind).toBe("Follow Up"); // blocked case first
    expect(f.actions.map((a: any) => a.kind)).toEqual(expect.arrayContaining(["Report", "Execute"]));
  });

  it("failed case -> issue -> fix deployed -> retest -> sign-off, with activity history", async () => {
    const f0 = await UD.getUatFeature(ids.f);
    const failed = f0.feature.testCases.find((t: any) => t.result === "Fail");
    const created = await U.createIssueFromTestCase(failed.id);
    expect(created.ok).toBe(true);
    ids.issue = created.data.issueId;
    expect((await U.createIssueFromTestCase(failed.id)).ok).toBe(false); // already linked
    const issue = await dbm.db.issue.findUniqueOrThrow({ where: { id: ids.issue } });
    expect(issue.seq).toBe(1);
    expect(issue.description).toContain("Found during UAT");
    let f = await UD.getUatFeature(ids.f);
    expect(f.actions.find((a: any) => a.kind === "Report").text).toContain("Follow up with engineering"); // already reported

    expect((await U.markFixDeployed(ids.f, true)).ok).toBe(true);
    f = await UD.getUatFeature(ids.f);
    expect(f.actions[0].kind).toBe("Retest");
    const rt = await U.retestFailed(ids.f);
    expect(rt.data.count).toBe(1);
    const cases = (await UD.getUatFeature(ids.f)).feature.testCases;
    expect(cases.find((t: any) => t.id === failed.id)).toMatchObject({ result: "Not Run", retestCount: 1 });

    expect((await U.setSignOff(ids.f, "Requested")).ok).toBe(false); // not everything passes yet
    for (const t of cases.filter((x: any) => x.result !== "Pass")) expect((await U.setTestResult(t.id, "Pass")).ok).toBe(true);
    f = await UD.getUatFeature(ids.f);
    expect(f.counts.passed).toBe(5);
    expect(f.suggestedStatus).toBe("Ready for Sign-off");
    expect(f.actions[0].text).toBe("All test cases passed. Request sign-off.");
    expect((await U.setSignOff(ids.f, "Requested")).ok).toBe(true);
    expect((await U.setSignOff(ids.f, "Signed Off")).ok).toBe(true);
    f = await UD.getUatFeature(ids.f);
    expect(f.feature).toMatchObject({ signOffStatus: "Signed Off", status: "Completed" });
    expect(f.actions).toEqual([]);
    const types = (await dbm.db.taskActivity.findMany()).map((a: any) => a.type);
    expect(types).toEqual(expect.arrayContaining(["UAT_CREATED", "UAT_RESULT_UPDATED", "UAT_SIGNOFF", "ISSUE_CREATED"]));
  });

  it("evidence upload is stored locally, served safely and removed with its case", async () => {
    const tc = (await UD.getUatFeature(ids.f)).feature.testCases[0];
    expect((await A.addEvidence(tc.id, png())).ok).toBe(true);
    expect((await A.addEvidence(tc.id, new FormData())).ok).toBe(false); // no file chosen
    const big = new FormData(); big.set("file", new File([new Uint8Array(15 * 1024 * 1024 + 1)], "big.bin"));
    const tooBig = await A.addEvidence(tc.id, big);
    expect(tooBig.ok).toBe(false);
    expect(tooBig.error).toMatch(/15 MB/);
    expect((await A.addEvidence(tc.id, png("page.html", "text/html"))).ok).toBe(true);

    const [shot, html] = await dbm.db.uatEvidence.findMany({ orderBy: { createdAt: "asc" } });
    expect(fs.existsSync(path.join(uploads, shot.filePath))).toBe(true);
    expect(shot.filePath.startsWith(`uat/${tc.id}/`)).toBe(true);
    const ok = await ROUTE.GET(new Request("http://x"), { params: Promise.resolve({ kind: "evidence", id: shot.id }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toContain("inline");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await ok.arrayBuffer()).length).toBe(7);
    const dl = await ROUTE.GET(new Request("http://x"), { params: Promise.resolve({ kind: "evidence", id: html.id }) });
    expect(dl.headers.get("content-disposition")).toContain("attachment"); // html is never rendered inline
    expect(dl.headers.get("content-type")).toBe("application/octet-stream");
    expect((await ROUTE.GET(new Request("http://x"), { params: Promise.resolve({ kind: "evidence", id: "nope" }) })).status).toBe(404);
    expect((await ROUTE.GET(new Request("http://x"), { params: Promise.resolve({ kind: "other", id: shot.id }) })).status).toBe(404);
    // a tampered path can never escape the uploads folder
    await dbm.db.uatEvidence.update({ where: { id: html.id }, data: { filePath: "../../package.json" } });
    expect((await ROUTE.GET(new Request("http://x"), { params: Promise.resolve({ kind: "evidence", id: html.id }) })).status).toBe(404);

    expect((await A.deleteEvidence(shot.id)).ok).toBe(true);
    expect(fs.existsSync(path.join(uploads, shot.filePath))).toBe(false);
    expect((await U.deleteTestCase(tc.id)).ok).toBe(true);
  });
});

describe("Issue tracker", () => {
  it("lifecycle: escalate, update with screenshot, fix, verify, close, reopen", async () => {
    const r = await I.createIssue({ ...issueBase, reportedDate: today(), reportedBy: "Budi", impact: "Bookings fail" , description: "Timeouts"});
    expect(r.ok).toBe(true);
    ids.i2 = r.data.id;
    let g = await ID.getIssue(ids.i2);
    expect((await dbm.db.issue.findUniqueOrThrow({ where: { id: ids.i2 } })).seq).toBe(2);
    expect(g.action.kind).toBe("Validate");
    expect((await I.escalateIssue(ids.i2, { to: "", reason: "", followUpDate: "" })).ok).toBe(false);
    expect((await I.escalateIssue(ids.i2, { to: "Backend team", reason: "Timeouts under load", followUpDate: shift(-1) })).ok).toBe(true);
    g = await ID.getIssue(ids.i2);
    expect(g.issue).toMatchObject({ status: "Escalated", escalationLevel: 1, responsiblePic: "Backend team" });
    expect(g.action.text).toBe("Request an investigation update from Backend team."); // follow-up date already passed

    const fd = png(); fd.set("message", "Reproduced on staging"); fd.set("nextFollowUp", shift(3));
    expect((await I.postIssueUpdate(ids.i2, fd)).ok).toBe(true);
    expect((await I.postIssueUpdate(ids.i2, (() => { const x = new FormData(); x.set("message", " "); return x; })())).ok).toBe(false);
    g = await ID.getIssue(ids.i2);
    expect(g.issue.latestUpdate).toBe("Reproduced on staging");
    const withFile = g.issue.updates.find((u: any) => u.filePath);
    expect(withFile.fileName).toBe("shot.png");
    expect(fs.existsSync(path.join(uploads, withFile.filePath))).toBe(true);
    expect(g.issue.updates.map((u: any) => u.kind)).toEqual(expect.arrayContaining(["Update", "Escalation"]));
    expect(g.action.kind).toBe("Wait"); // fresh update and a future follow-up

    expect((await I.resolveIssue(ids.i2, { rootCause: "N+1 query", resolution: "Added index", pendingVerification: true })).ok).toBe(true);
    g = await ID.getIssue(ids.i2);
    expect(g.issue).toMatchObject({ status: "Pending Verification", rootCause: "N+1 query" });
    expect(g.action.text).toBe("Verify the deployed fix with Budi.");
    expect((await I.setIssueStatus(ids.i2, "Resolved")).ok).toBe(true);
    g = await ID.getIssue(ids.i2);
    expect(g.issue.actualResolution).not.toBeNull();
    expect(g.action.kind).toBe("Confirm");
    expect((await I.setIssueStatus(ids.i2, "Closed")).ok).toBe(true);
    expect((await ID.getIssue(ids.i2)).action).toBeNull();
    expect((await I.setIssueStatus(ids.i2, "Investigating")).ok).toBe(true);
    expect((await ID.getIssue(ids.i2)).issue.actualResolution).toBeNull(); // reopened
    const types = (await dbm.db.taskActivity.findMany()).map((a: any) => a.type);
    expect(types).toEqual(expect.arrayContaining(["ISSUE_ESCALATED", "ISSUE_RESOLVED", "ISSUE_STATUS_CHANGED"]));
  });

  it("list filters, urgency ordering, and Next Actions integration", async () => {
    const all = await ID.listIssues();
    expect(all).toHaveLength(2);
    expect((await ID.listIssues({ severity: "Critical" }))).toHaveLength(0);
    expect((await ID.listIssues({ q: "timeout" })).length).toBe(1);
    const actions = await ID.getIssueActions();
    expect(actions.every((a: any) => a.action.kind !== "Wait")).toBe(true);
  });

  it("deleting an issue removes its files and unlinks UAT cases", async () => {
    const withFile = (await dbm.db.issueUpdate.findFirstOrThrow({ where: { issueId: ids.i2, filePath: { not: null } } })).filePath;
    expect((await I.deleteIssue(ids.i2)).ok).toBe(true);
    expect(fs.existsSync(path.join(uploads, withFile))).toBe(false);
    expect(await dbm.db.issueUpdate.count({ where: { issueId: ids.i2 } })).toBe(0);
    expect((await I.deleteIssue(ids.issue)).ok).toBe(true);
    expect((await dbm.db.uatTestCase.findMany({ where: { linkedIssueId: { not: null } } })).length).toBe(0);
  });
});

describe("Kanban moves, calendar and reminders", () => {
  it("moveTask requires context for Blocked / Waiting and logs history", async () => {
    const t = await T.createTask({ ...base, title: "Vendor compliance", dueDate: shift(1) });
    ids.t = t.data.id;
    expect((await T.moveTask(ids.t, "Blocked")).ok).toBe(false);
    expect((await T.moveTask(ids.t, "Waiting for Others")).ok).toBe(false);
    expect((await T.moveTask(ids.t, "Blocked", { blockerDescription: "Timestamp missing" })).ok).toBe(true);
    expect(await dbm.db.task.findUniqueOrThrow({ where: { id: ids.t } })).toMatchObject({ status: "Blocked", blockerDescription: "Timestamp missing" });
    expect((await T.moveTask(ids.t, "Waiting for Others", { waitingFor: "Engineering" })).ok).toBe(true);
    expect((await T.moveTask(ids.t, "In Progress")).ok).toBe(true);
    expect((await T.moveTask(ids.t, "Nonsense")).ok).toBe(false);
    expect((await T.moveTask(ids.t, "Done")).ok).toBe(true);
    expect((await dbm.db.task.findUniqueOrThrow({ where: { id: ids.t } })).completedAt).not.toBeNull();
    expect((await T.moveTask(ids.t, "To Do")).ok).toBe(true);
    const types = (await dbm.db.taskActivity.findMany({ where: { taskId: ids.t } })).map((a: any) => a.type);
    expect(types).toEqual(expect.arrayContaining(["BLOCKER_ADDED", "BLOCKER_RESOLVED", "TASK_COMPLETED", "TASK_REOPENED"]));
  });

  it("calendar shows every dated item and every kind can be rescheduled", async () => {
    await T.updateTask(ids.t, { ...base, title: "Vendor compliance", dueDate: shift(1), followUpDate: shift(2), status: "To Do" });
    const p = await dbm.db.project.create({ data: { name: "P1" } });
    const m = await dbm.db.projectMilestone.create({ data: { projectId: p.id, title: "Beta", dueDate: D.parseDateKey(shift(3)) } });
    const f = await U.createUatFeature({ ...uatBase, name: "Cal feature", targetDate: shift(4), manualTotal: "", status: "Preparing" });
    const iss = await I.createIssue({ ...issueBase, title: "Cal issue", reportedDate: today(), nextFollowUpDate: shift(5) });
    const plan = await dbm.db.planItem.create({ data: { date: shift(1), taskId: ids.t } });
    const range = [shift(0), shift(7)];
    let ev = await CD.getCalendarEvents(range[0], range[1]);
    expect(ev.map((e: any) => e.kind).sort()).toEqual(["issue-followup", "milestone", "plan", "task-due", "task-followup", "uat-target"]);
    expect(ev.find((e: any) => e.kind === "uat-target").date).toBe(shift(4));

    const moves: [string, string, string][] = [["task-due", ids.t, shift(6)], ["task-followup", ids.t, shift(6)], ["milestone", m.id, shift(6)], ["uat-target", f.data.id, shift(6)], ["issue-followup", iss.data.id, shift(6)], ["plan", plan.id, shift(6)]];
    for (const [k, id, d] of moves) expect((await C.rescheduleEvent(k, id, d)).ok, k).toBe(true);
    ev = await CD.getCalendarEvents(shift(6), shift(6));
    expect(ev).toHaveLength(6);
    expect((await C.rescheduleEvent("bogus", ids.t, shift(1))).ok).toBe(false);
    expect((await C.rescheduleEvent("task-due", ids.t, "2026-13-99x")).ok).toBe(false);
    expect((await dbm.db.taskActivity.findMany({ where: { type: "DEADLINE_CHANGED" } })).length).toBeGreaterThan(0);
    await dbm.db.planItem.delete({ where: { id: plan.id } });
    await I.deleteIssue(iss.data.id);
    await U.deleteUatFeature(f.data.id);
  });

  it("UAT and issue reminders: created, badged, concurrency-safe, removed when done", async () => {
    await dbm.db.reminder.deleteMany();
    const f = await U.createUatFeature({ ...uatBase, name: "Target soon", targetDate: shift(2), status: "In Progress" });
    const iss = await I.createIssue({ ...issueBase, title: "Needs follow-up", reportedDate: today(), nextFollowUpDate: shift(-1), expectedResolution: shift(-2) });
    const results = await Promise.all(Array.from({ length: 6 }, () => ED.syncReminders()));
    expect(results).toHaveLength(6);
    const rows = await dbm.db.reminder.findMany();
    const keys = rows.map((r: any) => `${r.taskId}|${r.issueId}|${r.uatFeatureId}|${r.type}`);
    expect(new Set(keys).size).toBe(keys.length);
    const active = await ED.getActiveReminders();
    expect(active.find((r: any) => r.type === "UAT_TARGET").message).toBe('UAT "Target soon" target date is in 2 days');
    expect(active.filter((r: any) => r.entity === "issue").map((r: any) => r.type).sort()).toEqual(["FOLLOW_UP_DUE", "OVERDUE"]);
    expect(active.find((r: any) => r.entity === "uat").href).toBe(`/uat/${f.data.id}`);
    const badges = ED.reminderBadges(active);
    expect(badges["/uat"]).toBe(1);
    expect(badges["/issues"]).toBe(2);

    const dismissed = active.find((r: any) => r.type === "UAT_TARGET");
    expect((await R.dismissReminder(dismissed.id)).ok).toBe(true);
    await ED.syncReminders();
    expect((await ED.getActiveReminders()).some((r: any) => r.id === dismissed.id)).toBe(false);

    await I.setIssueStatus(iss.data.id, "Resolved");
    await dbm.db.uatFeature.update({ where: { id: f.data.id }, data: { status: "Completed" } });
    await ED.syncReminders();
    expect((await dbm.db.reminder.findMany({ where: { OR: [{ issueId: { not: null } }, { uatFeatureId: { not: null } }] } })).length).toBe(0);
  });

  it("task attachments are stored, listed and deleted", async () => {
    expect((await A.addTaskAttachment(ids.t, png("spec.pdf", "application/pdf"))).ok).toBe(true);
    const t = await DM.getTask(ids.t);
    expect(t.attachments).toHaveLength(1);
    const stored = t.attachments[0].filePath;
    expect(fs.existsSync(path.join(uploads, stored))).toBe(true);
    expect((await A.deleteTaskAttachment(t.attachments[0].id)).ok).toBe(true);
    expect(fs.existsSync(path.join(uploads, stored))).toBe(false);
    expect((await A.addTaskAttachment("missing", png())).ok).toBe(false);
    expect(fs.readdirSync(path.join(uploads, "tasks"), { recursive: true }).filter((f: any) => String(f).includes("shot.png")).length).toBe(0); // failed write left no orphan file
  });

  it("everything survives a brand-new database connection", async () => {
    const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
    const { PrismaClient } = await import("../../src/generated/prisma/client");
    const fresh = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${dbFile}` }) });
    const out = { features: await fresh.uatFeature.count(), cases: await fresh.uatTestCase.count(), signed: (await fresh.uatFeature.findFirst({ where: { name: "Booking" } }))?.signOffStatus, counter: (await fresh.userPreference.findUnique({ where: { key: "counter:issue" } }))?.value };
    await fresh.$disconnect();
    expect(out.features).toBeGreaterThan(0);
    expect(out.cases).toBe(4);
    expect(out.signed).toBe("Signed Off");
    expect(Number(out.counter)).toBeGreaterThanOrEqual(4); // issue numbers are never reused
  });
});
