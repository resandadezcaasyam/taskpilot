"use server";

import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { taskCode } from "@/lib/constants";
import { formatDate, fromInputDate } from "@/lib/dates";
import { issueCode } from "@/lib/issues";
import type { CalKind } from "@/lib/calendar";
import type { ActionResult } from "@/lib/validators";
import { safe } from "./_shared";
import { setTaskDueDate } from "./tasks";

const RESCHEDULABLE: CalKind[] = ["task-due", "task-followup", "issue-followup", "uat-target", "milestone", "plan"];

/** Changes the date behind a calendar event (used by drag-and-drop and the event dialog). */
export async function rescheduleEvent(kind: string, entityId: string, date: string): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Use a valid date" };
  if (!(RESCHEDULABLE as string[]).includes(kind)) return { ok: false, error: "This item cannot be rescheduled" };
  const when = fromInputDate(date);
  if (kind === "task-due") return setTaskDueDate(entityId, date);

  return safe(async () => {
    await db.$transaction(async (tx) => {
      if (kind === "task-followup") {
        const t = await tx.task.update({ where: { id: entityId }, data: { followUpDate: when } });
        await logActivity(tx, { type: "TASK_UPDATED", message: `Follow-up rescheduled to ${formatDate(when)}`, taskId: t.id, projectId: t.projectId, meta: { code: taskCode(t.seq), title: t.title } });
      } else if (kind === "issue-followup") {
        const i = await tx.issue.update({ where: { id: entityId }, data: { nextFollowUpDate: when } });
        await logActivity(tx, { type: "ISSUE_UPDATED", message: `Follow-up rescheduled to ${formatDate(when)}`, projectId: i.projectId, meta: { code: issueCode(i.seq), title: i.title, href: `/issues/${i.id}` } });
      } else if (kind === "uat-target") {
        const f = await tx.uatFeature.update({ where: { id: entityId }, data: { targetDate: when } });
        await logActivity(tx, { type: "UAT_UPDATED", message: `Target date moved to ${formatDate(when)}`, projectId: f.projectId, meta: { title: f.name, href: `/uat/${f.id}` } });
      } else if (kind === "milestone") {
        await tx.projectMilestone.update({ where: { id: entityId }, data: { dueDate: when } });
      } else {
        const item = await tx.planItem.findUnique({ where: { id: entityId } });
        if (!item) throw new Error("Planned item no longer exists");
        const clash = await tx.planItem.findUnique({ where: { date_taskId: { date, taskId: item.taskId } } });
        if (clash && clash.id !== item.id) {
          await tx.planItem.update({ where: { id: clash.id }, data: { status: "Planned" } });
          await tx.planItem.delete({ where: { id: item.id } });
        } else {
          const last = await tx.planItem.aggregate({ where: { date }, _max: { position: true } });
          await tx.planItem.update({ where: { id: item.id }, data: { date, position: (last._max.position ?? -1) + 1 } });
        }
      }
    });
  });
}
