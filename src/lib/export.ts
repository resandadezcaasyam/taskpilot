import { db } from "./db";
import { taskCode } from "./constants";
import { toCsv } from "./csv";
import { dateKey } from "./dates";
import { issueCode } from "./issues";
import { parseMeta } from "./activity";
import { projectProgress } from "./metrics";
import { listUatFeatures } from "./uat-data";
import { buildXlsx, XLSX_CONTENT_TYPE, type CellKind, type XlsxSheet } from "./xlsx";

export const EXPORT_ENTITIES = ["tasks", "projects", "uat", "uat-test-cases", "issues", "activity"] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];
export const isExportEntity = (s: string): s is ExportEntity => (EXPORT_ENTITIES as readonly string[]).includes(s);
export type ExportFormat = "csv" | "json" | "xlsx";

const hours = (m: number | null) => (m ? Math.round((m / 60) * 100) / 100 : null);
const dates = (...cols: string[]) => Object.fromEntries(cols.map((c) => [c, "date" as CellKind]));
const stamps = (...cols: string[]) => Object.fromEntries(cols.map((c) => [c, "datetime" as CellKind]));
const nums = (...cols: string[]) => Object.fromEntries(cols.map((c) => [c, "number" as CellKind]));

export interface ExportResult { filename: string; contentType: string; body: string | Uint8Array }

/** `all` is the multi-sheet Excel workbook with everything. It exists in Excel format only. */
export async function exportEntity(entity: ExportEntity | "all", format: ExportFormat, now = new Date()): Promise<ExportResult> {
  const stamp = dateKey(now);
  if (entity === "all") {
    if (format !== "xlsx") throw new Error("The complete workbook is only available as Excel (.xlsx).");
    const sheets = (await Promise.all(EXPORT_ENTITIES.filter((e) => e !== "uat-test-cases").map(async (e) => (await collect(e)).sheets))).flat();
    return { filename: `taskpilot-all-data-${stamp}.xlsx`, contentType: XLSX_CONTENT_TYPE, body: await buildXlsx(sheets) };
  }
  const { sheets, json } = await collect(entity);
  if (format === "json") {
    return { filename: `taskpilot-${entity}-${stamp}.json`, contentType: "application/json; charset=utf-8", body: JSON.stringify({ entity, exportedAt: now.toISOString(), count: json.length, items: json }, null, 2) };
  }
  if (format === "xlsx") {
    return { filename: `taskpilot-${entity}-${stamp}.xlsx`, contentType: XLSX_CONTENT_TYPE, body: await buildXlsx(sheets) };
  }
  const primary = sheets[0];
  const rows = primary.rows.map((r) =>
    Object.fromEntries(primary.columns.map((c) => {
      const v = r[c];
      const k = primary.kinds[c];
      return [c, v instanceof Date ? (k === "date" ? dateKey(v) : v.toISOString()) : v];
    })),
  );
  // BOM so Excel opens UTF-8 (accents, Indonesian text) correctly
  return { filename: `taskpilot-${entity}-${stamp}.csv`, contentType: "text/csv; charset=utf-8", body: `\uFEFF${toCsv(rows, primary.columns)}` };
}

async function collect(entity: ExportEntity): Promise<{ sheets: XlsxSheet[]; json: unknown[] }> {
  if (entity === "tasks") {
    const tasks = await db.task.findMany({
      orderBy: { seq: "asc" },
      include: { project: { select: { name: true } }, tags: { include: { tag: true } }, subtasks: true, comments: { orderBy: { createdAt: "asc" } }, dependsOn: { include: { dependsOn: { select: { seq: true } } } } },
    });
    const columns = ["Task ID", "Title", "Description", "Project", "Category", "Priority", "Status", "Start Date", "Due Date", "Assignee", "Stakeholder", "Estimated (h)", "Actual (h)", "Progress %", "Next Action", "Next Action Deadline", "Blocker", "Waiting For", "Follow-up Date", "Tags", "Depends On", "Notes", "Created", "Updated", "Completed"];
    const rows = tasks.map((t) => ({
      "Task ID": taskCode(t.seq), Title: t.title, Description: t.description, Project: t.project?.name, Category: t.category, Priority: t.priority, Status: t.status,
      "Start Date": t.startDate, "Due Date": t.dueDate, Assignee: t.assignee, Stakeholder: t.stakeholder, "Estimated (h)": hours(t.estimatedMinutes), "Actual (h)": hours(t.actualMinutes),
      "Progress %": t.progress, "Next Action": t.nextAction, "Next Action Deadline": t.nextActionDue, Blocker: t.blockerDescription, "Waiting For": t.waitingFor,
      "Follow-up Date": t.followUpDate, Tags: t.tags.map((x) => x.tag.name).sort().join("; "), "Depends On": t.dependsOn.map((d) => taskCode(d.dependsOn.seq)).join("; "),
      Notes: t.notes, Created: t.createdAt, Updated: t.updatedAt, Completed: t.completedAt,
    }));
    const kinds = { ...dates("Start Date", "Due Date", "Next Action Deadline", "Follow-up Date"), ...stamps("Created", "Updated", "Completed"), ...nums("Estimated (h)", "Actual (h)", "Progress %") };
    return {
      sheets: [
        { name: "Tasks", columns, kinds, rows },
        { name: "Subtasks", columns: ["Task ID", "Task", "Subtask", "Done"], kinds: {}, rows: tasks.flatMap((t) => t.subtasks.map((s) => ({ "Task ID": taskCode(t.seq), Task: t.title, Subtask: s.title, Done: s.done ? "Yes" : "No" }))) },
        { name: "Comments", columns: ["Task ID", "Task", "Comment", "Date"], kinds: stamps("Date"), rows: tasks.flatMap((t) => t.comments.map((c) => ({ "Task ID": taskCode(t.seq), Task: t.title, Comment: c.body, Date: c.createdAt }))) },
      ],
      json: tasks.map((t) => ({ ...t, code: taskCode(t.seq), tags: t.tags.map((x) => x.tag.name), dependsOn: t.dependsOn.map((d) => taskCode(d.dependsOn.seq)) })),
    };
  }

  if (entity === "projects") {
    const projects = await db.project.findMany({ orderBy: { createdAt: "asc" }, include: { tasks: { select: { seq: true, status: true, progress: true } }, milestones: { orderBy: { dueDate: "asc" } } } });
    const columns = ["Name", "Description", "Owner", "Category", "Priority", "Status", "Start Date", "Target Date", "Progress %", "Total Tasks", "Completed Tasks", "Milestones", "Risks", "Notes", "Created"];
    const rows = projects.map((p) => ({
      Name: p.name, Description: p.description, Owner: p.owner, Category: p.category, Priority: p.priority, Status: p.status, "Start Date": p.startDate, "Target Date": p.targetDate,
      "Progress %": projectProgress(p.tasks), "Total Tasks": p.tasks.filter((t) => t.status !== "Cancelled").length, "Completed Tasks": p.tasks.filter((t) => t.status === "Done").length,
      Milestones: p.milestones.map((m) => `${m.title}${m.dueDate ? ` (${dateKey(m.dueDate)})` : ""}${m.completedAt ? " ✓" : ""}`).join("; "), Risks: p.risks, Notes: p.notes, Created: p.createdAt,
    }));
    return {
      sheets: [
        { name: "Projects", columns, kinds: { ...dates("Start Date", "Target Date"), ...stamps("Created"), ...nums("Progress %", "Total Tasks", "Completed Tasks") }, rows },
        { name: "Milestones", columns: ["Project", "Milestone", "Due Date", "Completed"], kinds: { ...dates("Due Date"), ...stamps("Completed") }, rows: projects.flatMap((p) => p.milestones.map((m) => ({ Project: p.name, Milestone: m.title, "Due Date": m.dueDate, Completed: m.completedAt }))) },
      ],
      json: projects.map((p) => ({ ...p, progress: projectProgress(p.tasks), tasks: p.tasks.map((t) => taskCode(t.seq)) })),
    };
  }

  if (entity === "uat" || entity === "uat-test-cases") {
    const cases = await db.uatTestCase.findMany({ orderBy: [{ featureId: "asc" }, { position: "asc" }], include: { feature: { select: { name: true } } } });
    // Column names match the importer, so this sheet can be saved as CSV and re-imported into a feature.
    const caseSheet: XlsxSheet = {
      name: "UAT test cases",
      columns: ["Feature", "Title", "Prerequisites", "Steps", "Expected Result", "Actual Result", "Result", "Remarks", "Bug", "Retests"],
      kinds: nums("Retests"),
      rows: cases.map((c) => ({ Feature: c.feature.name, Title: c.title, Prerequisites: c.prerequisites, Steps: c.steps, "Expected Result": c.expectedResult, "Actual Result": c.actualResult, Result: c.result, Remarks: c.remarks, Bug: c.linkedBug, Retests: c.retestCount })),
    };
    if (entity === "uat-test-cases") return { sheets: [caseSheet], json: cases };
    const list = await listUatFeatures();
    const columns = ["Feature", "Project", "Release", "Environment", "Owner", "Start Date", "Target Date", "Status", "Sign-off", "Total", "Passed", "Failed", "Blocked", "Not Run", "Execution %", "Pass Rate %", "Remarks"];
    const featureSheet: XlsxSheet = {
      name: "UAT features",
      columns,
      kinds: { ...dates("Start Date", "Target Date"), ...nums("Total", "Passed", "Failed", "Blocked", "Not Run", "Execution %", "Pass Rate %") },
      rows: list.map(({ feature: f, counts: c, metrics: m }) => ({
        Feature: f.name, Project: f.project?.name, Release: f.releaseVersion, Environment: f.environment, Owner: f.owner, "Start Date": f.startDate, "Target Date": f.targetDate, Status: f.status,
        "Sign-off": f.signOffStatus, Total: c.total, Passed: c.passed, Failed: c.failed, Blocked: c.blocked, "Not Run": c.notRun, "Execution %": m.executionProgress, "Pass Rate %": m.passRate, Remarks: f.remarks,
      })),
    };
    const full = await db.uatFeature.findMany({ orderBy: { createdAt: "asc" }, include: { project: { select: { name: true } }, testCases: { orderBy: { position: "asc" }, include: { evidence: { select: { fileName: true } } } } } });
    return { sheets: [featureSheet, caseSheet], json: full };
  }

  if (entity === "issues") {
    const issues = await db.issue.findMany({ orderBy: { seq: "asc" }, include: { project: { select: { name: true } }, updates: { orderBy: { createdAt: "asc" } } } });
    const columns = ["Issue ID", "Title", "Description", "Project", "Category", "Severity", "Reported By", "Responsible PIC", "Reported Date", "Status", "Root Cause", "Impact", "Workaround", "Expected Resolution", "Actual Resolution", "Next Follow-up", "Latest Update", "Escalations"];
    const rows = issues.map((i) => ({
      "Issue ID": issueCode(i.seq), Title: i.title, Description: i.description, Project: i.project?.name, Category: i.category, Severity: i.severity, "Reported By": i.reportedBy, "Responsible PIC": i.responsiblePic,
      "Reported Date": i.reportedDate, Status: i.status, "Root Cause": i.rootCause, Impact: i.impact, Workaround: i.workaround, "Expected Resolution": i.expectedResolution,
      "Actual Resolution": i.actualResolution, "Next Follow-up": i.nextFollowUpDate, "Latest Update": i.latestUpdate, Escalations: i.escalationLevel,
    }));
    return {
      sheets: [
        { name: "Issues", columns, kinds: { ...dates("Reported Date", "Expected Resolution", "Actual Resolution", "Next Follow-up"), ...nums("Escalations") }, rows },
        { name: "Issue updates", columns: ["Issue ID", "Issue", "Type", "Update", "Attachment", "Date"], kinds: stamps("Date"), rows: issues.flatMap((i) => i.updates.map((u) => ({ "Issue ID": issueCode(i.seq), Issue: i.title, Type: u.kind, Update: u.message, Attachment: u.fileName, Date: u.createdAt }))) },
      ],
      json: issues.map((i) => ({ ...i, code: issueCode(i.seq) })),
    };
  }

  const acts = await db.taskActivity.findMany({ orderBy: { createdAt: "asc" }, include: { task: { select: { seq: true, title: true } } } });
  const rows = acts.map((a) => {
    const m = parseMeta(a.meta);
    return { Time: a.createdAt, Type: a.type, Item: [a.task ? taskCode(a.task.seq) : m.code, a.task?.title ?? m.title].filter(Boolean).join(" "), Message: a.message };
  });
  return { sheets: [{ name: "Activity", columns: ["Time", "Type", "Item", "Message"], kinds: stamps("Time"), rows }], json: acts };
}
