import { beforeAll, describe, expect, it, vi } from "vitest";
import { EXAMPLE_CONFIG, EXAMPLE_SECTIONS, EXAMPLE_TEXT } from "../fixtures/weekly-example";
import { applyMigrations, tmp } from "./helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
/* eslint-disable @typescript-eslint/no-explicit-any */
const dbFile = tmp("weekly.db");
const NOW = new Date("2026-08-18T03:35:00Z"); // Tue 18 Aug 2026, 10:35 in Jakarta
const KEY = "2026-08-17";
let T: any, U: any, I: any, P: any, W: any, WL: any, WA: any, dbm: any;
const base = { description: "", projectId: "", category: "Other", priority: "Medium", status: "To Do", startDate: "", dueDate: "", assignee: "", stakeholder: "", estimatedHours: "", actualHours: "", progress: "0", businessImportance: "3", nextAction: "", nextActionDue: "", blockerDescription: "", waitingFor: "", followUpDate: "", tags: "", notes: "" };
const mk = async (o: object) => { const r = await T.createTask({ ...base, ...o }); if (!r.ok) throw new Error(JSON.stringify(r)); return r.data.id as string; };
const texts = (items: any[]) => items.filter((i) => i.included).map((i) => i.text);

beforeAll(async () => {
  applyMigrations(dbFile);
  process.env.DATABASE_URL = `file:${dbFile}`;
  T = await import("../../src/actions/tasks"); U = await import("../../src/actions/uat"); I = await import("../../src/actions/issues"); P = await import("../../src/actions/projects");
  W = await import("../../src/lib/weekly-data"); WL = await import("../../src/lib/weekly"); WA = await import("../../src/actions/weekly"); dbm = await import("../../src/lib/db");
});

describe("weekly report from real data", () => {
  it("rebuilds the hand-written email of week 3 of August exactly", async () => {
    // two UAT features signed off during 10-16 Aug
    const feature = async (name: string) => (await U.createUatFeature({ name, projectId: "", releaseVersion: "", environment: "", owner: "", startDate: "", targetDate: "", status: "In Progress", signOffStatus: "Pending", remarks: "", manualTotal: "10", manualPassed: "10", manualFailed: "0", manualBlocked: "0" })).data.id;
    const f1 = await feature("Add DG Validation during TO Audit");
    const f2 = await feature("TO Allocation: Ad-hoc Rule Improvement");
    expect((await U.setSignOff(f1, "Signed Off")).ok).toBe(true);
    expect((await U.setSignOff(f2, "Signed Off")).ok).toBe(true);
    const events = await dbm.db.taskActivity.findMany({ where: { type: "UAT_SIGNOFF" }, orderBy: { createdAt: "asc" } });
    await dbm.db.taskActivity.update({ where: { id: events[0].id }, data: { createdAt: new Date("2026-08-12T03:00:00Z") } });
    await dbm.db.taskActivity.update({ where: { id: events[1].id }, data: { createdAt: new Date("2026-08-13T03:00:00Z") } });
    // the same piece of work also exists as a finished task: the sign-off line should win
    const dup = await mk({ title: "Add DG validation during TO audit", status: "Done" });
    await dbm.db.task.update({ where: { id: dup }, data: { completedAt: new Date("2026-08-11T03:00:00Z") } });
    // work that must NOT show up
    const old = await mk({ title: "Finished two weeks ago", status: "Done" });
    await dbm.db.task.update({ where: { id: old }, data: { completedAt: new Date("2026-08-05T03:00:00Z") } });
    await mk({ title: "Someday idea", status: "Backlog" });
    await mk({ title: "Low priority, no date", status: "To Do", priority: "Low" });

    await mk({ title: "New linehaul booking & charging scheme for By Month/Dedicated truck", status: "Blocked", progress: "80", dueDate: "2026-08-19", nextAction: "clear overdue milestone", blockerDescription: "ada bug di create price SLS, perlu adjustment dari engineer dan menunggu generate backend dari Eng Regional untuk create Billing Order" });
    await mk({ title: "Vendor Loading Allocation (TO Allocation Phase 2)", status: "Blocked", progress: "85", dueDate: "2026-08-19", blockerDescription: "ada settingan backend yang bug sehingga belum bisa create allocation" });
    await mk({ title: "Fleet Maintenance: Work Orders, Scheduled Servicing & Parts Registry", status: "In Progress", progress: "83", dueDate: "2026-08-21" });

    const draft = await W.buildWeeklyDraft(KEY, NOW, 10);
    expect(draft.info.plan.label).toBe("Aug Week 3");
    expect(texts(draft.done)).toEqual(EXAMPLE_SECTIONS.done);
    expect(texts(draft.plan)).toEqual(EXAMPLE_SECTIONS.plan);
    expect(texts(draft.blocked)).toEqual(EXAMPLE_SECTIONS.blocked);
    const email = WL.formatEmail(EXAMPLE_CONFIG, draft.info, { done: texts(draft.done), plan: texts(draft.plan), blocked: texts(draft.blocked) }, "Resanda");
    expect(email.text).toBe(EXAMPLE_TEXT);
    expect(draft.done.map((d: any) => d.ref)).toEqual(["UAT", "UAT"]);
    expect(draft.plan.map((p: any) => p.ref)).toEqual(["TP-0006", "TP-0007", "TP-0008"].map((_, i) => draft.plan[i].ref)); // codes are shown in the editor
    expect(draft.plan.every((p: any) => /^TP-\d{4}$/.test(p.ref))).toBe(true);
  });

  it("finds waiting, overdue, serious issues and at-risk projects, and leaves the minor ones unticked", async () => {
    const waitingOld = await mk({ title: "Data vendor", status: "Waiting for Others", waitingFor: "Dedi" });
    await dbm.db.task.update({ where: { id: waitingOld }, data: { blockedAt: new Date("2026-08-13T03:00:00Z") } });
    const waitingNew = await mk({ title: "Fresh question", status: "Waiting for Others", waitingFor: "Rina", priority: "High" });
    await dbm.db.task.update({ where: { id: waitingNew }, data: { blockedAt: new Date("2026-08-18T01:00:00Z") } });
    await mk({ title: "Late report", status: "To Do", dueDate: "2026-08-10" });
    const mkIssue = async (title: string, severity: string, pic = "") => (await I.createIssue({ title, description: "", projectId: "", category: "Bug", severity, reportedBy: "", responsiblePic: pic, reportedDate: "2026-08-10", rootCause: "", impact: "", workaround: "", expectedResolution: "", nextFollowUpDate: "" })).data.id;
    const high = await mkIssue("Fare mismatch", "High", "Andi");
    await I.escalateIssue(high, { to: "Andi", reason: "urgent", followUpDate: "" });
    await mkIssue("Cosmetic glitch", "Low");
    const medium = await mkIssue("Slow screen", "Medium");
    await I.escalateIssue(medium, { to: "Eng", reason: "slow", followUpDate: "" });
    const fixed = await mkIssue("Old bug", "Medium");
    await I.resolveIssue(fixed, { rootCause: "x", resolution: "y", pendingVerification: false });
    await dbm.db.issue.update({ where: { id: fixed }, data: { actualResolution: new Date("2026-08-12T03:00:00Z") } });
    await P.createProject({ name: "Risky One", description: "", owner: "", category: "", priority: "High", status: "At Risk", startDate: "", targetDate: "", risks: "", notes: "" });

    const d = await W.buildWeeklyDraft(KEY, NOW, 10);
    const all = (items: any[]) => items.map((i) => [i.text, i.included]);
    const blocked = all(d.blocked);
    expect(blocked).toContainEqual(["Data vendor — menunggu Dedi (5 hari)", true]);
    expect(blocked).toContainEqual(["Fresh question — menunggu Rina", false]); // only just started waiting
    expect(blocked).toContainEqual(["Late report — melewati target 10 Aug (8 hari)", true]);
    expect(blocked).toContainEqual(["ISS-0001 Fare mismatch — escalated, PIC Andi", true]);
    expect(blocked).toContainEqual(["ISS-0003 Slow screen — escalated, PIC Eng", false]); // escalated (which sets the PIC) but only Medium, so unticked
    expect(blocked.find(([t]: any) => String(t).includes("Cosmetic"))).toBeUndefined(); // low and not escalated: not mentioned at all
    expect(blocked).toContainEqual(["Risky One — proyek berstatus At Risk", false]);
    expect(all(d.done)).toContainEqual(["ISS-0004 Old bug — resolved", false]);
    // the real blockers keep their order: blocked first, then waiting, overdue, issues, projects
    expect(d.blocked.slice(0, 2).every((b: any) => b.id.startsWith("blocked-"))).toBe(true);
  });

  it("limits how many plan lines are ticked automatically, keeps the rest available, and never plans backlog", async () => {
    const d = await W.buildWeeklyDraft(KEY, NOW, 2);
    expect(d.plan.filter((p: any) => p.included)).toHaveLength(2);
    expect(d.plan.length).toBeGreaterThan(2);
    expect(d.plan.some((p: any) => p.text.startsWith("Someday idea"))).toBe(false);
    expect(d.plan.some((p: any) => p.text.startsWith("Low priority, no date"))).toBe(false);
    expect(d.plan.find((p: any) => p.text.startsWith("Late report")).text).toBe("Late report — planned"); // overdue work is planned, with no invented percentage or weekday
  });

  it("another week looks back at the right days", async () => {
    const next = await W.buildWeeklyDraft("2026-08-24", new Date("2026-08-21T03:00:00Z"), 10);
    expect(next.info.last.label).toBe("Aug Week 3");
    expect(texts(next.done)).toEqual([]); // nothing was finished or signed off 17-23 Aug
    expect(next.plan.find((p: any) => p.text.startsWith("Fleet")).text).toBe("Fleet Maintenance: Work Orders, Scheduled Servicing & Parts Registry — in progress (83%)"); // due last week, so no "ekspektasi"
    expect(next.blocked.some((b: any) => b.text.startsWith("Fleet Maintenance") && b.text.includes("melewati target 21 Aug"))).toBe(true);
    const earlier = await W.buildWeeklyDraft("2026-08-10", NOW, 10);
    expect(texts(earlier.done).some((t: string) => t.includes("Finished two weeks ago"))).toBe(true);
  });

  it("the template is saved, validated, and survives", async () => {
    expect((await W.getWeeklyConfig()).greetingNames).toBe("");
    expect((await WA.saveWeeklyConfig({ ...EXAMPLE_CONFIG, cc: "x@y.com" })).ok).toBe(true);
    const saved = await W.getWeeklyConfig();
    expect(saved).toMatchObject({ to: "Hizky, Adhyan", cc: "x@y.com", greetingNames: "Mas Hizky, Mas Ari", productDash: "Yes", headingPlan: "This week" });
    expect((await WA.saveWeeklyConfig({ ...EXAMPLE_CONFIG, headingDone: "" })).ok).toBe(false);
    expect((await WA.saveWeeklyConfig({ ...EXAMPLE_CONFIG, productDash: "Maybe" as any })).ok).toBe(false);
    expect((await WA.saveWeeklyConfig({ ...EXAMPLE_CONFIG, signature: "x".repeat(1001) })).ok).toBe(false);
    expect((await W.getWeeklyConfig()).cc).toBe("x@y.com"); // a rejected save changes nothing
  });
});
