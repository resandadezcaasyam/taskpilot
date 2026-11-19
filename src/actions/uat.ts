"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { fromInputDate } from "@/lib/dates";
import { removeStored } from "@/lib/files";
import { issueCode } from "@/lib/issues";
import { mapTestCaseRows, parseCsv, type ParsedCase } from "@/lib/csv";
import { countCases, TEST_RESULT_VALUES } from "@/lib/uat";
import {
  testCaseSchema, uatFeatureSchema, type ActionResult, type TestCaseValues, type UatFeatureValues,
} from "@/lib/validators";
import { createIssueRow } from "./_issue-core";
import { safe } from "./_shared";

const text = (s: string) => s.trim() || null;
const num = (s: string) => (s === "" ? null : Number(s));
const meta = (f: { id: string; name: string }) => ({ title: f.name, href: `/uat/${f.id}` });

function featureData(v: UatFeatureValues) {
  return {
    name: v.name.trim(), projectId: v.projectId || null, releaseVersion: text(v.releaseVersion), environment: text(v.environment),
    owner: text(v.owner), startDate: fromInputDate(v.startDate), targetDate: fromInputDate(v.targetDate), status: v.status,
    signOffStatus: v.signOffStatus, remarks: text(v.remarks), manualTotal: num(v.manualTotal), manualPassed: num(v.manualPassed),
    manualFailed: num(v.manualFailed), manualBlocked: num(v.manualBlocked),
  };
}

export async function createUatFeature(input: UatFeatureValues): Promise<ActionResult<{ id: string }>> {
  const p = uatFeatureSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid UAT feature" };
  return safe(() =>
    db.$transaction(async (tx) => {
      const f = await tx.uatFeature.create({ data: featureData(p.data) });
      await logActivity(tx, { type: "UAT_CREATED", message: `UAT feature created: ${f.name}`, projectId: f.projectId, meta: meta(f) });
      return { id: f.id };
    }),
  );
}

export async function updateUatFeature(id: string, input: UatFeatureValues): Promise<ActionResult> {
  const p = uatFeatureSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid UAT feature" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const before = await tx.uatFeature.findUnique({ where: { id } });
      if (!before) throw new Error("UAT feature no longer exists");
      const f = await tx.uatFeature.update({ where: { id }, data: featureData(p.data) });
      const notes: string[] = [];
      if (before.status !== f.status) notes.push(`status ${before.status} → ${f.status}`);
      if (before.signOffStatus !== f.signOffStatus) notes.push(`sign-off ${before.signOffStatus} → ${f.signOffStatus}`);
      await logActivity(tx, {
        type: f.signOffStatus === "Signed Off" && before.signOffStatus !== "Signed Off" ? "UAT_SIGNOFF" : "UAT_UPDATED",
        message: `UAT feature updated${notes.length ? ` (${notes.join(", ")})` : ""}`, projectId: f.projectId, meta: meta(f),
      });
    });
  });
}

export async function deleteUatFeature(id: string): Promise<ActionResult> {
  const files = await db.uatEvidence.findMany({ where: { testCase: { featureId: id } }, select: { filePath: true } });
  const res = await safe(async () => {
    await db.$transaction(async (tx) => {
      const f = await tx.uatFeature.findUnique({ where: { id } });
      if (!f) return;
      await logActivity(tx, { type: "UAT_UPDATED", message: `UAT feature deleted: ${f.name}`, projectId: f.projectId, meta: { title: f.name } });
      await tx.uatFeature.delete({ where: { id } });
    });
  });
  if (res.ok) await Promise.all(files.map((f) => removeStored(f.filePath)));
  return res;
}

/** Records that engineering shipped a fix, so the failed cases are due for a retest. */
export async function markFixDeployed(featureId: string, deployed: boolean): Promise<ActionResult> {
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const f = await tx.uatFeature.update({ where: { id: featureId }, data: { fixDeployedAt: deployed ? new Date() : null } });
      await logActivity(tx, { type: "UAT_UPDATED", message: deployed ? "Fix marked as deployed. Retest the failed cases." : "Fix-deployed flag cleared", projectId: f.projectId, meta: meta(f) });
    });
  });
}

const signOffSchema = z.enum(["Pending", "Requested", "Signed Off", "Rejected"]);
export async function setSignOff(featureId: string, status: string): Promise<ActionResult> {
  const s = signOffSchema.safeParse(status);
  if (!s.success) return { ok: false, error: "Unknown sign-off status" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const f = await tx.uatFeature.findUnique({ where: { id: featureId }, include: { testCases: { select: { result: true } } } });
      if (!f) throw new Error("UAT feature no longer exists");
      if (s.data === "Requested" || s.data === "Signed Off") {
        const c = f.testCases.length ? countCases(f.testCases) : { total: f.manualTotal ?? 0, passed: f.manualPassed ?? 0 };
        if (c.total === 0 || c.passed !== c.total) throw new Error("Sign-off needs every test case to pass first");
      }
      const data: { signOffStatus: string; status?: string } = { signOffStatus: s.data };
      if (s.data === "Signed Off") data.status = "Completed";
      if (s.data === "Requested" && f.status !== "Completed") data.status = "Ready for Sign-off";
      await tx.uatFeature.update({ where: { id: featureId }, data });
      await logActivity(tx, { type: "UAT_SIGNOFF", message: `Sign-off ${s.data.toLowerCase()}`, projectId: f.projectId, meta: meta(f) });
    });
  });
}

// ---------------- test cases ----------------

function caseData(v: TestCaseValues) {
  return {
    title: v.title.trim(), prerequisites: text(v.prerequisites), steps: text(v.steps), expectedResult: text(v.expectedResult),
    actualResult: text(v.actualResult), result: v.result, remarks: text(v.remarks), linkedBug: text(v.linkedBug),
  };
}

export async function createTestCase(featureId: string, input: TestCaseValues): Promise<ActionResult<{ id: string }>> {
  const p = testCaseSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid test case" };
  return safe(async () => {
    const count = await db.uatTestCase.count({ where: { featureId } });
    const t = await db.uatTestCase.create({ data: { ...caseData(p.data), featureId, position: count } });
    return { id: t.id };
  });
}

export async function updateTestCase(id: string, input: TestCaseValues): Promise<ActionResult> {
  const p = testCaseSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid test case" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const before = await tx.uatTestCase.findUnique({ where: { id }, include: { feature: true } });
      if (!before) throw new Error("Test case no longer exists");
      await tx.uatTestCase.update({ where: { id }, data: caseData(p.data) });
      if (before.result !== p.data.result) {
        await logActivity(tx, { type: "UAT_RESULT_UPDATED", message: `${before.title}: ${before.result} → ${p.data.result}`, projectId: before.feature.projectId, meta: meta(before.feature) });
      }
    });
  });
}

export async function deleteTestCase(id: string): Promise<ActionResult> {
  const files = await db.uatEvidence.findMany({ where: { testCaseId: id }, select: { filePath: true } });
  const res = await safe(async () => {
    await db.uatTestCase.delete({ where: { id } });
  });
  if (res.ok) await Promise.all(files.map((f) => removeStored(f.filePath)));
  return res;
}

const resultSchema = z.enum(TEST_RESULT_VALUES);
export async function setTestResult(id: string, result: string, actualResult?: string): Promise<ActionResult> {
  const r = resultSchema.safeParse(result);
  if (!r.success) return { ok: false, error: "Unknown result" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const t = await tx.uatTestCase.findUnique({ where: { id }, include: { feature: true } });
      if (!t) throw new Error("Test case no longer exists");
      if (t.result === r.data && actualResult === undefined) return;
      await tx.uatTestCase.update({
        where: { id },
        data: { result: r.data, ...(actualResult !== undefined ? { actualResult: text(actualResult) } : {}) },
      });
      // once nothing is failing any more the "fix deployed" flag has done its job
      if (t.feature.fixDeployedAt) {
        const failed = await tx.uatTestCase.count({ where: { featureId: t.featureId, result: "Fail" } });
        if (failed === 0) await tx.uatFeature.update({ where: { id: t.featureId }, data: { fixDeployedAt: null } });
      }
      await logActivity(tx, { type: "UAT_RESULT_UPDATED", message: `${t.title}: ${t.result} → ${r.data}`, projectId: t.feature.projectId, meta: meta(t.feature) });
    });
  });
}

/** Moves every failed case back to Not Run for another attempt. */
export async function retestFailed(featureId: string): Promise<ActionResult<{ count: number }>> {
  return safe(() =>
    db.$transaction(async (tx) => {
      const f = await tx.uatFeature.findUnique({ where: { id: featureId } });
      if (!f) throw new Error("UAT feature no longer exists");
      const failed = await tx.uatTestCase.findMany({ where: { featureId, result: "Fail" } });
      for (const t of failed) await tx.uatTestCase.update({ where: { id: t.id }, data: { result: "Not Run", retestCount: t.retestCount + 1 } });
      await tx.uatFeature.update({ where: { id: featureId }, data: { fixDeployedAt: null } });
      if (failed.length) {
        await logActivity(tx, { type: "UAT_RESULT_UPDATED", message: `${failed.length} failed ${failed.length === 1 ? "case" : "cases"} queued for retest`, projectId: f.projectId, meta: meta(f) });
      }
      return { count: failed.length };
    }),
  );
}

const importRowSchema = z.object({
  title: z.string().trim().min(1).max(300),
  prerequisites: z.string().max(5000), steps: z.string().max(5000), expectedResult: z.string().max(5000),
  actualResult: z.string().max(5000), result: resultSchema, remarks: z.string().max(5000), linkedBug: z.string().max(200),
});

/** Imports parsed CSV rows. Titles that already exist in the feature are skipped, so re-importing is safe. */
export async function importTestCases(featureId: string, rows: ParsedCase[]): Promise<ActionResult<{ created: number; skipped: number }>> {
  const parsed = z.array(importRowSchema).max(2000).safeParse(rows);
  if (!parsed.success) return { ok: false, error: "The rows are not valid. Check the CSV and try again." };
  return safe(() =>
    db.$transaction(async (tx) => {
      const f = await tx.uatFeature.findUnique({ where: { id: featureId } });
      if (!f) throw new Error("UAT feature no longer exists");
      const existing = await tx.uatTestCase.findMany({ where: { featureId }, select: { title: true } });
      const have = new Set(existing.map((e) => e.title.toLowerCase()));
      let position = existing.length;
      let created = 0;
      let skipped = 0;
      for (const r of parsed.data) {
        if (have.has(r.title.toLowerCase())) {
          skipped++;
          continue;
        }
        have.add(r.title.toLowerCase());
        await tx.uatTestCase.create({ data: { featureId, position: position++, ...caseData(r) } });
        created++;
      }
      await logActivity(tx, { type: "UAT_UPDATED", message: `Imported ${created} test ${created === 1 ? "case" : "cases"} from CSV${skipped ? ` (${skipped} duplicates skipped)` : ""}`, projectId: f.projectId, meta: meta(f) });
      return { created, skipped };
    }),
  );
}

/** Server-side parse of raw CSV text, used when a caller has only the text. */
export async function previewCsv(textInput: string) {
  return mapTestCaseRows(parseCsv(textInput));
}

// ---------------- issue links ----------------

export async function linkTestCaseIssue(testCaseId: string, issueId: string | null): Promise<ActionResult> {
  return safe(async () => {
    const issue = issueId ? await db.issue.findUnique({ where: { id: issueId } }) : null;
    if (issueId && !issue) throw new Error("Issue no longer exists");
    await db.uatTestCase.update({ where: { id: testCaseId }, data: { linkedIssueId: issueId, linkedBug: issue ? issueCode(issue.seq) : null } });
  });
}

export async function createIssueFromTestCase(testCaseId: string): Promise<ActionResult<{ issueId: string }>> {
  return safe(() =>
    db.$transaction(async (tx) => {
      const t = await tx.uatTestCase.findUnique({ where: { id: testCaseId }, include: { feature: true } });
      if (!t) throw new Error("Test case no longer exists");
      if (t.linkedIssueId) throw new Error("This test case already has a linked issue");
      const lines = [
        `Found during UAT of "${t.feature.name}"${t.feature.releaseVersion ? ` (${t.feature.releaseVersion})` : ""}.`,
        t.prerequisites && `Prerequisites: ${t.prerequisites}`,
        t.steps && `Steps:\n${t.steps}`,
        t.expectedResult && `Expected: ${t.expectedResult}`,
        t.actualResult && `Actual: ${t.actualResult}`,
      ].filter(Boolean);
      const issue = await createIssueRow(tx, {
        title: `UAT failure: ${t.title}`.slice(0, 250), description: lines.join("\n\n"), projectId: t.feature.projectId,
        category: "Bug", severity: "Medium", reportedBy: t.feature.owner,
      });
      await tx.uatTestCase.update({ where: { id: testCaseId }, data: { linkedIssueId: issue.id, linkedBug: issueCode(issue.seq) } });
      return { issueId: issue.id };
    }),
  );
}
