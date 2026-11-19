import fs from "node:fs";
import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { applyMigrations, tmp } from "./helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
/* eslint-disable @typescript-eslint/no-explicit-any */
const dbFile = tmp("excel.db");
let T: any, P: any, U: any, I: any, EX: any, dbm: any, route: any, CSV: any;
const base = { description: "", projectId: "", category: "Other", priority: "Medium", status: "To Do", startDate: "", dueDate: "", assignee: "", stakeholder: "", estimatedHours: "", actualHours: "", progress: "0", businessImportance: "3", nextAction: "", nextActionDue: "", blockerDescription: "", waitingFor: "", followUpDate: "", tags: "", notes: "" };
const open = async (bytes: Uint8Array) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes as unknown as ArrayBuffer); return wb; };
const sheets = (wb: ExcelJS.Workbook) => wb.worksheets.map((w) => w.name);
const header = (ws: ExcelJS.Worksheet) => (ws.getRow(1).values as unknown[]).slice(1);

beforeAll(async () => {
  applyMigrations(dbFile);
  process.env.DATABASE_URL = `file:${dbFile}`;
  T = await import("../../src/actions/tasks"); P = await import("../../src/actions/projects"); U = await import("../../src/actions/uat");
  I = await import("../../src/actions/issues"); EX = await import("../../src/lib/export");
  dbm = await import("../../src/lib/db"); CSV = await import("../../src/lib/csv");
  route = await import("../../src/app/api/export/[entity]/route");

  const proj = await P.createProject({ name: "Booking", description: "", owner: "R", category: "", priority: "High", status: "Active", startDate: "", targetDate: "", risks: "", notes: "" });
  const pid = proj.data.id;
  await P.addMilestone(pid, "Beta", "2026-12-01");
  const t1 = await T.createTask({ ...base, projectId: pid, title: "=HYPERLINK(\"http://evil\",\"x\")", dueDate: "2026-11-19", followUpDate: "2026-11-20", estimatedHours: "1.5", tags: "uat, zeta", notes: "line1\nline2, with comma" });
  const t2 = await T.createTask({ ...base, projectId: pid, title: "Normal task", status: "Done" });
  await T.addSubtask(t1.data.id, "Draft outline"); await T.addComment(t1.data.id, "First comment");
  void t2;
  const f = await U.createUatFeature({ name: "Feature A", projectId: pid, releaseVersion: "v1", environment: "Staging", owner: "S", startDate: "", targetDate: "2026-11-25", status: "In Progress", signOffStatus: "Pending", remarks: "", manualTotal: "", manualPassed: "", manualFailed: "", manualBlocked: "" });
  await U.importTestCases(f.data.id, CSV.mapTestCaseRows(CSV.parseCsv("Title,Result\nOpen,Pass\nPay,Fail\nCancel,Not Run")).cases);
  const i = await I.createIssue({ title: "Fare mismatch", description: "d", projectId: pid, category: "Bug", severity: "High", reportedBy: "Sari", responsiblePic: "", reportedDate: "2026-11-19", rootCause: "", impact: "", workaround: "", expectedResolution: "2026-11-30", nextFollowUpDate: "" });
  const fd = new FormData(); fd.set("message", "Reproduced on staging"); fd.set("nextFollowUp", "");
  await I.postIssueUpdate(i.data.id, fd);
});

describe("Excel (.xlsx) export of real data", () => {
  it("every entity downloads as a valid workbook with the right sheets and row counts", async () => {
    const expected: Record<string, [string[], Record<string, number>]> = {
      tasks: [["Tasks", "Subtasks", "Comments"], { Tasks: await dbm.db.task.count(), Subtasks: 1, Comments: 1 }],
      projects: [["Projects", "Milestones"], { Projects: 1, Milestones: 1 }],
      uat: [["UAT features", "UAT test cases"], { "UAT features": 1, "UAT test cases": 3 }],
      "uat-test-cases": [["UAT test cases"], { "UAT test cases": 3 }],
      issues: [["Issues", "Issue updates"], { Issues: 1, "Issue updates": 2 }],
      activity: [["Activity"], { Activity: await dbm.db.taskActivity.count() }],
    };
    for (const e of EX.EXPORT_ENTITIES) {
      const out = await EX.exportEntity(e, "xlsx");
      expect(out.filename).toMatch(new RegExp(`^taskpilot-${e}-\\d{4}-\\d{2}-\\d{2}\\.xlsx$`));
      expect(out.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      expect(out.body).toBeInstanceOf(Uint8Array);
      const wb = await open(out.body as Uint8Array);
      expect(sheets(wb)).toEqual(expected[e][0]);
      for (const [name, rows] of Object.entries(expected[e][1])) expect(wb.getWorksheet(name)!.rowCount - 1, `${e}/${name}`).toBe(rows);
    }
  });

  it("dates are real Excel dates, numbers are numbers, and formula-like text stays text", async () => {
    const ws = (await open((await EX.exportEntity("tasks", "xlsx")).body as Uint8Array)).getWorksheet("Tasks")!;
    const h = header(ws) as string[];
    const col = (name: string) => h.indexOf(name) + 1;
    const evil = ws.getRow(2);
    expect(typeof evil.getCell(col("Title")).value).toBe("string");
    expect(evil.getCell(col("Title")).formula).toBeUndefined();
    expect((evil.getCell(col("Due Date")).value as Date).toISOString().slice(0, 10)).toBe("2026-11-19");
    expect((evil.getCell(col("Follow-up Date")).value as Date).toISOString().slice(0, 10)).toBe("2026-11-20");
    expect(evil.getCell(col("Due Date")).numFmt).toBe("yyyy-mm-dd");
    expect(evil.getCell(col("Estimated (h)")).value).toBe(1.5);
    expect(evil.getCell(col("Created")).value).toBeInstanceOf(Date);
    expect(evil.getCell(col("Tags")).value).toBe("uat; zeta");
    expect(evil.getCell(col("Notes")).value).toBe("line1\nline2, with comma");
    expect(evil.getCell(col("Task ID")).value).toBe("TP-0001");
    expect(ws.getRow(3).getCell(col("Due Date")).value).toBeNull();
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  });

  it("UAT sheet carries the metrics; the test-case sheet is re-importable", async () => {
    const wb = await open((await EX.exportEntity("uat", "xlsx")).body as Uint8Array);
    const f = wb.getWorksheet("UAT features")!;
    const h = header(f) as string[];
    const row = f.getRow(2);
    expect(row.getCell(h.indexOf("Total") + 1).value).toBe(3);
    expect(row.getCell(h.indexOf("Execution %") + 1).value).toBe(67);
    expect(row.getCell(h.indexOf("Pass Rate %") + 1).value).toBe(50);
    const cases = wb.getWorksheet("UAT test cases")!;
    const title = (header(cases) as string[]).indexOf("Title") + 1;
    expect([2, 3, 4].map((r) => cases.getRow(r).getCell(title).value)).toEqual(["Open", "Pay", "Cancel"]);
  });

  it("the complete workbook has every sheet in a sensible order", async () => {
    const out = await EX.exportEntity("all", "xlsx");
    expect(out.filename).toMatch(/^taskpilot-all-data-/);
    const wb = await open(out.body as Uint8Array);
    expect(sheets(wb)).toEqual(["Tasks", "Subtasks", "Comments", "Projects", "Milestones", "UAT features", "UAT test cases", "Issues", "Issue updates", "Activity"]);
    fs.writeFileSync(tmp("all-data.xlsx"), out.body as Uint8Array); // for an independent check outside Node
    await expect(EX.exportEntity("all", "csv")).rejects.toThrow(/only available as Excel/);
  });

  it("CSV and JSON still work, with calendar dates as text in CSV", async () => {
    const csv = (await EX.exportEntity("tasks", "csv")).body as string;
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(",2026-11-19,");
    expect(csv).toContain("\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\")\"");
    expect(JSON.parse((await EX.exportEntity("issues", "json")).body as string).count).toBe(1);
  });

  it("the download route serves Excel with the right headers and rejects bad requests", async () => {
    const get = (entity: string, q = "") => route.GET(new Request(`http://x/api/export/${entity}${q}`), { params: Promise.resolve({ entity }) });
    const ok = await get("tasks", "?format=xlsx");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(ok.headers.get("content-disposition")).toMatch(/^attachment; filename="taskpilot-tasks-\d{4}-\d{2}-\d{2}\.xlsx"$/);
    const bytes = new Uint8Array(await ok.arrayBuffer());
    expect(sheets(await open(bytes))).toContain("Tasks");
    expect((await get("all")).headers.get("content-disposition")).toContain("all-data");
    expect((await get("all", "?format=csv")).status).toBe(400);
    expect((await get("tasks", "?format=pdf")).status).toBe(400);
    expect((await get("secrets", "?format=xlsx")).status).toBe(404);
    expect((await get("issues")).headers.get("content-type")).toContain("text/csv"); // default stays CSV
  });
});

