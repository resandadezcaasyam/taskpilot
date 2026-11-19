"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { formatDate, fromInputDate } from "@/lib/dates";
import { readFileFromForm, removeStored, saveUpload } from "@/lib/files";
import { ISSUE_STATUSES, issueCode } from "@/lib/issues";
import { issueFormSchema, type ActionResult, type IssueFormValues } from "@/lib/validators";
import { createIssueRow } from "./_issue-core";
import { safe } from "./_shared";

const text = (s: string) => s.trim() || null;
const meta = (i: { id: string; seq: number; title: string }) => ({ code: issueCode(i.seq), title: i.title, href: `/issues/${i.id}` });

function toData(v: IssueFormValues) {
  return {
    title: v.title.trim(), description: text(v.description), projectId: v.projectId || null, category: v.category, severity: v.severity,
    reportedBy: text(v.reportedBy), responsiblePic: text(v.responsiblePic), reportedDate: fromInputDate(v.reportedDate) ?? new Date(),
    rootCause: text(v.rootCause), impact: text(v.impact), workaround: text(v.workaround),
    expectedResolution: fromInputDate(v.expectedResolution), nextFollowUpDate: fromInputDate(v.nextFollowUpDate),
  };
}

export async function createIssue(input: IssueFormValues): Promise<ActionResult<{ id: string }>> {
  const p = issueFormSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid issue" };
  return safe(() => db.$transaction(async (tx) => ({ id: (await createIssueRow(tx, toData(p.data))).id })));
}

export async function updateIssue(id: string, input: IssueFormValues): Promise<ActionResult> {
  const p = issueFormSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid issue" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const before = await tx.issue.findUnique({ where: { id } });
      if (!before) throw new Error("Issue no longer exists");
      const i = await tx.issue.update({ where: { id }, data: toData(p.data) });
      await logActivity(tx, { type: "ISSUE_UPDATED", message: "Issue details updated", projectId: i.projectId, meta: meta(i) });
    });
  });
}

export async function deleteIssue(id: string): Promise<ActionResult> {
  const files = await db.issueUpdate.findMany({ where: { issueId: id, filePath: { not: null } }, select: { filePath: true } });
  const res = await safe(async () => {
    await db.$transaction(async (tx) => {
      const i = await tx.issue.findUnique({ where: { id } });
      if (!i) return;
      await logActivity(tx, { type: "ISSUE_UPDATED", message: "Issue deleted", projectId: i.projectId, meta: { code: issueCode(i.seq), title: i.title } });
      await tx.issue.delete({ where: { id } });
    });
  });
  if (res.ok) await Promise.all(files.map((f) => removeStored(f.filePath)));
  return res;
}

/** Posts an investigation update. FormData: message (required), file (optional screenshot), nextFollowUp (optional date). */
export async function postIssueUpdate(issueId: string, form: FormData): Promise<ActionResult> {
  const message = String(form.get("message") ?? "").trim();
  const nextFollowUp = String(form.get("nextFollowUp") ?? "");
  if (!message) return { ok: false, error: "Write the update first" };
  if (!/^(\d{4}-\d{2}-\d{2})?$/.test(nextFollowUp)) return { ok: false, error: "Use a valid follow-up date" };
  let stored: Awaited<ReturnType<typeof saveUpload>> | null = null;
  const res = await safe(async () => {
    const file = readFileFromForm(form);
    const issue = await db.issue.findUnique({ where: { id: issueId } });
    if (!issue) throw new Error("Issue no longer exists");
    if (file) stored = await saveUpload(`issues/${issueId}`, file);
    await db.$transaction(async (tx) => {
      await tx.issueUpdate.create({
        data: { issueId, kind: "Update", message: message.slice(0, 5000), filePath: stored?.filePath, fileName: stored?.fileName, mimeType: stored?.mimeType, sizeBytes: stored?.sizeBytes },
      });
      const i = await tx.issue.update({
        where: { id: issueId },
        data: { latestUpdate: message.slice(0, 300), ...(nextFollowUp ? { nextFollowUpDate: fromInputDate(nextFollowUp) } : {}), updatedAt: new Date() },
      });
      await logActivity(tx, { type: "ISSUE_UPDATED", message: `Update posted: ${message.slice(0, 120)}`, projectId: i.projectId, meta: meta(i) });
    });
  });
  if (!res.ok && stored) await removeStored((stored as { filePath: string }).filePath);
  return res;
}

const escalateSchema = z.object({ to: z.string().max(120), reason: z.string().max(2000), followUpDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/) });
export async function escalateIssue(id: string, input: { to: string; reason: string; followUpDate: string }): Promise<ActionResult> {
  const v = escalateSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Check the escalation details" };
  if (!v.data.to.trim() && !v.data.reason.trim()) return { ok: false, error: "Say who you are escalating to, or why" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const before = await tx.issue.findUnique({ where: { id } });
      if (!before) throw new Error("Issue no longer exists");
      const to = v.data.to.trim();
      const msg = `Escalated${to ? ` to ${to}` : ""}${v.data.reason.trim() ? `: ${v.data.reason.trim()}` : ""}`;
      await tx.issueUpdate.create({ data: { issueId: id, kind: "Escalation", message: msg } });
      const i = await tx.issue.update({
        where: { id },
        data: {
          status: "Escalated", escalationLevel: { increment: 1 }, latestUpdate: msg.slice(0, 300),
          ...(to ? { responsiblePic: to } : {}), ...(v.data.followUpDate ? { nextFollowUpDate: fromInputDate(v.data.followUpDate) } : {}),
        },
      });
      await logActivity(tx, { type: "ISSUE_ESCALATED", message: msg, projectId: i.projectId, meta: meta(i) });
    });
  });
}

const statusSchema = z.enum(ISSUE_STATUSES);
export async function setIssueStatus(id: string, status: string, note?: string): Promise<ActionResult> {
  const s = statusSchema.safeParse(status);
  if (!s.success) return { ok: false, error: "Unknown status" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const before = await tx.issue.findUnique({ where: { id } });
      if (!before) throw new Error("Issue no longer exists");
      if (before.status === s.data) return;
      const closing = s.data === "Resolved" || s.data === "Closed";
      const reopening = (before.status === "Resolved" || before.status === "Closed") && !closing;
      const msg = `Status changed from ${before.status} to ${s.data}${note?.trim() ? `: ${note.trim()}` : ""}`;
      await tx.issueUpdate.create({ data: { issueId: id, kind: "Status", message: msg } });
      const i = await tx.issue.update({
        where: { id },
        data: {
          status: s.data, latestUpdate: msg.slice(0, 300),
          ...(s.data === "Resolved" && !before.actualResolution ? { actualResolution: new Date() } : {}),
          ...(reopening ? { actualResolution: null } : {}),
        },
      });
      await logActivity(tx, { type: s.data === "Resolved" ? "ISSUE_RESOLVED" : "ISSUE_STATUS_CHANGED", message: msg, projectId: i.projectId, meta: meta(i) });
    });
  });
}

const resolveSchema = z.object({ rootCause: z.string().max(5000), resolution: z.string().max(5000), pendingVerification: z.boolean() });
/** Records the fix. With pendingVerification the issue waits for confirmation; otherwise it is marked Resolved. */
export async function resolveIssue(id: string, input: { rootCause: string; resolution: string; pendingVerification: boolean }): Promise<ActionResult> {
  const v = resolveSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Check the resolution details" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const before = await tx.issue.findUnique({ where: { id } });
      if (!before) throw new Error("Issue no longer exists");
      const status = v.data.pendingVerification ? "Pending Verification" : "Resolved";
      const msg = `${v.data.pendingVerification ? "Fix deployed, pending verification" : "Resolved"}${v.data.resolution.trim() ? `: ${v.data.resolution.trim()}` : ""}`;
      await tx.issueUpdate.create({ data: { issueId: id, kind: "Resolution", message: msg } });
      const i = await tx.issue.update({
        where: { id },
        data: {
          status, latestUpdate: msg.slice(0, 300), ...(v.data.rootCause.trim() ? { rootCause: v.data.rootCause.trim() } : {}),
          ...(status === "Resolved" ? { actualResolution: new Date(), nextFollowUpDate: null } : {}),
        },
      });
      await logActivity(tx, { type: status === "Resolved" ? "ISSUE_RESOLVED" : "ISSUE_STATUS_CHANGED", message: `${msg} (${formatDate(new Date())})`, projectId: i.projectId, meta: meta(i) });
    });
  });
}
