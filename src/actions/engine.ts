"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { taskCode } from "@/lib/constants";
import { addDays, dateKey, formatDate, fromInputDate, startOfToday } from "@/lib/dates";
import type { ActionResult } from "@/lib/validators";
import { safe } from "./_shared";
import { setTaskStatus } from "./tasks";

const meta = (t: { seq: number; title: string }) => ({ code: taskCode(t.seq), title: t.title });
const dateInput = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use a valid date");

async function requireTask(tx: typeof db, id: string) {
  const t = await tx.task.findUnique({ where: { id } });
  if (!t) throw new Error("Task no longer exists");
  return t;
}

/** Start Now: moves To Do / Backlog tasks to In Progress and puts the task on today's plan. */
export async function startNow(taskId: string): Promise<ActionResult> {
  const t = await db.task.findUnique({ where: { id: taskId } });
  if (!t) return { ok: false, error: "Task no longer exists" };
  if (t.status === "Backlog" || t.status === "To Do") {
    const r = await setTaskStatus(taskId, "In Progress");
    if (!r.ok) return r;
  }
  return safe(async () => {
    const today = dateKey(new Date());
    const existing = await db.planItem.findUnique({ where: { date_taskId: { date: today, taskId } } });
    if (existing) {
      if (existing.status === "Dropped") await db.planItem.update({ where: { id: existing.id }, data: { status: "Planned" } });
      return;
    }
    const last = await db.planItem.aggregate({ where: { date: today }, _max: { position: true } });
    await db.planItem.create({ data: { date: today, taskId, position: (last._max.position ?? -1) + 1 } });
  });
}

/** Marks a recommended action as done. The parent task is NOT completed. */
export async function completeNextAction(
  taskId: string,
  action: { kind: string; text: string; score: number; reason: string },
): Promise<ActionResult> {
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const t = await requireTask(tx as typeof db, taskId);
      const now = new Date();
      await tx.nextAction.updateMany({ where: { taskId, status: "Override" }, data: { status: "Done", completedAt: now } });
      await tx.nextAction.create({
        data: { taskId, kind: action.kind, text: action.text.slice(0, 500), score: action.score, reason: action.reason.slice(0, 500), status: "Done", completedAt: now },
      });
      const data: Record<string, unknown> = { updatedAt: now };
      if (t.nextAction && t.nextAction.trim() === action.text.trim()) data.nextAction = null;
      const followKind = action.kind === "Follow Up" || action.kind === "Resolve Blocker";
      if (followKind && t.followUpDate && t.followUpDate.getTime() <= now.getTime()) data.followUpDate = null;
      await tx.task.update({ where: { id: taskId }, data });
      await logActivity(tx, {
        type: "NEXT_ACTION_COMPLETED", message: `Next action completed: ${action.text}`,
        taskId, projectId: t.projectId, meta: meta(t),
      });
    });
  });
}

const postponeSchema = z.enum(["tomorrow", "3days", "nextweek"]);
export async function postponeNextAction(
  taskId: string,
  option: string,
  action: { kind: string; text: string; score: number },
): Promise<ActionResult<{ until: string }>> {
  const p = postponeSchema.safeParse(option);
  if (!p.success) return { ok: false, error: "Unknown option" };
  const days = p.data === "tomorrow" ? 1 : p.data === "3days" ? 3 : 7;
  const until = addDays(startOfToday(), days);
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const t = await requireTask(tx as typeof db, taskId);
      await tx.nextAction.updateMany({ where: { taskId, status: "Postponed" }, data: { status: "Replaced" } });
      await tx.nextAction.create({
        data: { taskId, kind: action.kind, text: action.text.slice(0, 500), score: action.score, status: "Postponed", postponedTo: until },
      });
      await logActivity(tx, {
        type: "NEXT_ACTION_POSTPONED", message: `Next action postponed until ${formatDate(until)}`,
        taskId, projectId: t.projectId, meta: meta(t),
      });
    });
    return { until: dateKey(until) };
  });
}

export async function cancelPostpone(taskId: string): Promise<ActionResult> {
  return safe(async () => {
    await db.nextAction.updateMany({ where: { taskId, status: "Postponed" }, data: { status: "Cleared" } });
  });
}

const overrideSchema = z.object({ text: z.string().max(500), pinned: z.boolean() });
export async function overrideNextAction(taskId: string, input: { text: string; pinned: boolean }): Promise<ActionResult> {
  const v = overrideSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Keep the action under 500 characters" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const t = await requireTask(tx as typeof db, taskId);
      await tx.nextAction.updateMany({ where: { taskId, status: "Override" }, data: { status: "Replaced" } });
      const text = v.data.text.trim();
      if (text || v.data.pinned) {
        await tx.nextAction.create({ data: { taskId, kind: "Override", text, pinned: v.data.pinned, status: "Override" } });
        await tx.nextAction.updateMany({ where: { taskId, status: "Postponed" }, data: { status: "Cleared" } });
      }
      await logActivity(tx, {
        type: "NEXT_ACTION_OVERRIDDEN",
        message: text || v.data.pinned ? `Recommendation overridden${text ? `: ${text}` : ""}${v.data.pinned ? " (pinned to top)" : ""}` : "Recommendation override removed",
        taskId, projectId: t.projectId, meta: meta(t),
      });
    });
  });
}

// ---------- follow-ups and waiting / blocked quick actions ----------

const followUpSchema = z.object({ note: z.string().max(2000), nextDate: dateInput });
export async function recordFollowUp(taskId: string, input: { note: string; nextDate: string }): Promise<ActionResult> {
  const v = followUpSchema.safeParse(input);
  if (!v.success) return { ok: false, error: v.error.issues[0]?.message ?? "Invalid follow-up" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const t = await requireTask(tx as typeof db, taskId);
      const note = v.data.note.trim();
      if (note) await tx.taskComment.create({ data: { taskId, body: `Follow-up: ${note}` } });
      await tx.task.update({ where: { id: taskId }, data: { followUpDate: fromInputDate(v.data.nextDate), updatedAt: new Date() } });
      await logActivity(tx, {
        type: "FOLLOW_UP_RECORDED",
        message: `Follow-up recorded${note ? `: ${note}` : ""}${v.data.nextDate ? ` · next follow-up ${formatDate(fromInputDate(v.data.nextDate))}` : ""}`,
        taskId, projectId: t.projectId, meta: meta(t),
      });
    });
  });
}

export async function updateBlocker(taskId: string, text: string): Promise<ActionResult> {
  const v = text.trim();
  if (!v) return { ok: false, error: "Describe what is blocking this task" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const t = await requireTask(tx as typeof db, taskId);
      await tx.task.update({ where: { id: taskId }, data: { blockerDescription: v.slice(0, 2000), updatedAt: new Date() } });
      await logActivity(tx, { type: "TASK_UPDATED", message: `Blocker updated: ${v}`, taskId, projectId: t.projectId, meta: meta(t) });
    });
  });
}

export async function changePic(taskId: string, name: string): Promise<ActionResult> {
  const v = name.trim();
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const t = await requireTask(tx as typeof db, taskId);
      await tx.task.update({ where: { id: taskId }, data: { waitingFor: v ? v.slice(0, 200) : null, updatedAt: new Date() } });
      await logActivity(tx, {
        type: "TASK_UPDATED", message: v ? `Responsible PIC changed to ${v}` : "Responsible PIC cleared",
        taskId, projectId: t.projectId, meta: meta(t),
      });
    });
  });
}

export async function rescheduleFollowUp(taskId: string, date: string): Promise<ActionResult> {
  const v = dateInput.safeParse(date);
  if (!v.success) return { ok: false, error: "Use a valid date" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const t = await requireTask(tx as typeof db, taskId);
      await tx.task.update({ where: { id: taskId }, data: { followUpDate: fromInputDate(date) } });
      await logActivity(tx, {
        type: "TASK_UPDATED", message: date ? `Follow-up rescheduled to ${formatDate(fromInputDate(date))}` : "Follow-up date cleared",
        taskId, projectId: t.projectId, meta: meta(t),
      });
    });
  });
}

/** Resolve Blocker (Blocked) and Resume Task (Waiting) both put the task back In Progress. */
export async function resumeTask(taskId: string): Promise<ActionResult> {
  return setTaskStatus(taskId, "In Progress");
}
