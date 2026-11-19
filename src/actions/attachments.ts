"use server";

import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { taskCode } from "@/lib/constants";
import { readFileFromForm, removeStored, saveUpload } from "@/lib/files";
import type { ActionResult } from "@/lib/validators";
import { safe } from "./_shared";

/** All uploads use the form field "file". The stored copy is removed if the database write fails. */
async function withUpload<T>(subdir: string, form: FormData, write: (f: Awaited<ReturnType<typeof saveUpload>>) => Promise<T>): Promise<ActionResult<T>> {
  const file = readFileFromForm(form);
  if (!file) return { ok: false, error: "Choose a file first" };
  let stored: Awaited<ReturnType<typeof saveUpload>> | null = null;
  const res = await safe(async () => {
    stored = await saveUpload(subdir, file);
    return write(stored);
  });
  if (!res.ok && stored) await removeStored((stored as { filePath: string }).filePath);
  return res;
}

export async function addTaskAttachment(taskId: string, form: FormData): Promise<ActionResult> {
  const r = await withUpload(`tasks/${taskId}`, form, async (f) => {
    await db.$transaction(async (tx) => {
      const t = await tx.task.findUnique({ where: { id: taskId } });
      if (!t) throw new Error("Task no longer exists");
      await tx.taskAttachment.create({ data: { taskId, fileName: f.fileName, filePath: f.filePath, mimeType: f.mimeType, sizeBytes: f.sizeBytes } });
      await logActivity(tx, { type: "TASK_UPDATED", message: `Attached ${f.fileName}`, taskId, projectId: t.projectId, meta: { code: taskCode(t.seq), title: t.title } });
    });
  });
  return r.ok ? { ok: true, data: undefined } : r;
}

export async function deleteTaskAttachment(id: string): Promise<ActionResult> {
  const a = await db.taskAttachment.findUnique({ where: { id } });
  const res = await safe(async () => {
    await db.taskAttachment.deleteMany({ where: { id } });
  });
  if (res.ok && a) await removeStored(a.filePath);
  return res;
}

export async function addEvidence(testCaseId: string, form: FormData): Promise<ActionResult> {
  const r = await withUpload(`uat/${testCaseId}`, form, async (f) => {
    const t = await db.uatTestCase.findUnique({ where: { id: testCaseId } });
    if (!t) throw new Error("Test case no longer exists");
    await db.uatEvidence.create({ data: { testCaseId, fileName: f.fileName, filePath: f.filePath, mimeType: f.mimeType, sizeBytes: f.sizeBytes } });
  });
  return r.ok ? { ok: true, data: undefined } : r;
}

export async function deleteEvidence(id: string): Promise<ActionResult> {
  const e = await db.uatEvidence.findUnique({ where: { id } });
  const res = await safe(async () => {
    await db.uatEvidence.deleteMany({ where: { id } });
  });
  if (res.ok && e) await removeStored(e.filePath);
  return res;
}
