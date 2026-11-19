"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { taskCode } from "@/lib/constants";
import { addDays, dateKey, startOfToday } from "@/lib/dates";
import type { ActionResult } from "@/lib/validators";
import { safe } from "./_shared";
import { setTaskProgress } from "./tasks";

const today = () => dateKey(new Date());
const tomorrow = () => dateKey(addDays(startOfToday(), 1));

export async function addToPlan(taskId: string): Promise<ActionResult> {
  return safe(async () => {
    const date = today();
    const existing = await db.planItem.findUnique({ where: { date_taskId: { date, taskId } } });
    if (existing) {
      if (existing.status === "Dropped") await db.planItem.update({ where: { id: existing.id }, data: { status: "Planned" } });
      return;
    }
    const last = await db.planItem.aggregate({ where: { date }, _max: { position: true } });
    await db.planItem.create({ data: { date, taskId, position: (last._max.position ?? -1) + 1 } });
  });
}

export async function removeFromPlan(itemId: string): Promise<ActionResult> {
  return safe(async () => {
    await db.planItem.delete({ where: { id: itemId } });
  });
}

export async function reorderPlan(orderedIds: string[]): Promise<ActionResult> {
  return safe(async () => {
    await db.$transaction(
      orderedIds.map((id, position) => db.planItem.update({ where: { id }, data: { position } })),
    );
  });
}

/** Marks today's planned item done. This does NOT complete the task itself. */
export async function setPlanDone(itemId: string, done: boolean): Promise<ActionResult> {
  return safe(async () => {
    await db.planItem.update({ where: { id: itemId }, data: { status: done ? "Done" : "Planned", doneAt: done ? new Date() : null } });
  });
}

const workSchema = z.object({
  minutes: z.number().int().min(0).max(720),
  progress: z.number().int().min(0).max(100).nullable(),
  note: z.string().max(2000),
});

export async function recordWork(
  itemId: string,
  input: { minutes: number; progress: number | null; note: string },
): Promise<ActionResult> {
  const v = workSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Minutes must be 0-720 and progress 0-100" };
  const { minutes, progress, note } = v.data;
  if (minutes === 0 && progress === null && !note.trim()) return { ok: false, error: "Add minutes, a progress value or a note" };

  const res = await safe(async () => {
    return db.$transaction(async (tx) => {
      const item = await tx.planItem.findUnique({ where: { id: itemId }, include: { task: true } });
      if (!item) throw new Error("Planned item no longer exists");
      await tx.planItem.update({ where: { id: itemId }, data: { workedMinutes: { increment: minutes } } });
      await tx.task.update({
        where: { id: item.taskId },
        // read-modify-write: SQL "NULL + n" stays NULL, so a plain increment would lose the first entry
        data: { updatedAt: new Date(), ...(minutes ? { actualMinutes: (item.task.actualMinutes ?? 0) + minutes } : {}) },
      });
      if (note.trim()) await tx.taskComment.create({ data: { taskId: item.taskId, body: `Work log${minutes ? ` (${minutes}m)` : ""}: ${note.trim()}` } });
      await logActivity(tx, {
        type: "TASK_UPDATED",
        message: `Logged ${minutes ? `${minutes}m of work` : "a work note"}${note.trim() ? `: ${note.trim()}` : ""}`,
        taskId: item.taskId, projectId: item.task.projectId,
        meta: { code: taskCode(item.task.seq), title: item.task.title, progress: item.task.progress },
      });
      return { taskId: item.taskId, current: item.task.progress };
    });
  });
  if (!res.ok) return res;
  if (progress !== null && progress !== res.data.current) {
    const p = await setTaskProgress(res.data.taskId, progress);
    if (!p.ok) return p;
  }
  return { ok: true, data: undefined };
}

async function moveItem(itemId: string, date: string) {
  const item = await db.planItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("Planned item no longer exists");
  const clash = await db.planItem.findUnique({ where: { date_taskId: { date, taskId: item.taskId } } });
  if (clash) {
    await db.planItem.update({ where: { id: clash.id }, data: { status: "Planned" } });
    await db.planItem.delete({ where: { id: itemId } });
    return;
  }
  const last = await db.planItem.aggregate({ where: { date }, _max: { position: true } });
  await db.planItem.update({ where: { id: itemId }, data: { date, position: (last._max.position ?? -1) + 1, status: "Planned", doneAt: null } });
}

export async function moveToTomorrow(itemId: string): Promise<ActionResult> {
  return safe(() => moveItem(itemId, tomorrow()));
}

/** Pulls an unfinished item from an earlier day into today. */
export async function carryToToday(itemId: string): Promise<ActionResult> {
  return safe(() => moveItem(itemId, today()));
}

export async function dropPlanItem(itemId: string): Promise<ActionResult> {
  return safe(async () => {
    await db.planItem.update({ where: { id: itemId }, data: { status: "Dropped" } });
  });
}

/** Autosaved while typing, so it deliberately does not refresh the page. */
export async function saveDailyNote(date: string, note: string): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Invalid date" };
  try {
    await db.dailyNote.upsert({
      where: { date },
      create: { date, note: note.slice(0, 20000) },
      update: { note: note.slice(0, 20000) },
    });
    return { ok: true, data: undefined };
  } catch (e) {
    console.error("[taskpilot] note save failed:", e);
    return { ok: false, error: "Could not save your note" };
  }
}
