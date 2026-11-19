"use server";

import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { fromInputDate } from "@/lib/dates";
import { projectFormSchema, type ActionResult, type ProjectFormValues } from "@/lib/validators";
import { safe } from "./_shared";

const text = (s: string) => s.trim() || null;

function toData(v: ProjectFormValues) {
  return {
    name: v.name.trim(),
    description: text(v.description),
    owner: text(v.owner),
    category: text(v.category),
    priority: v.priority,
    status: v.status,
    startDate: fromInputDate(v.startDate),
    targetDate: fromInputDate(v.targetDate),
    risks: text(v.risks),
    notes: text(v.notes),
  };
}

export async function createProject(input: ProjectFormValues): Promise<ActionResult<{ id: string }>> {
  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid project" };
  return safe(() =>
    db.$transaction(async (tx) => {
      const p = await tx.project.create({ data: toData(parsed.data) });
      await logActivity(tx, {
        type: "PROJECT_CREATED",
        message: `Project created: ${p.name}`,
        projectId: p.id,
        meta: { title: p.name },
      });
      return { id: p.id };
    }),
  );
}

export async function updateProject(id: string, input: ProjectFormValues): Promise<ActionResult> {
  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid project" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const before = await tx.project.findUnique({ where: { id } });
      if (!before) throw new Error("Project no longer exists");
      const p = await tx.project.update({ where: { id }, data: toData(parsed.data) });
      const statusNote = before.status !== p.status ? ` (status: ${before.status} → ${p.status})` : "";
      await logActivity(tx, {
        type: "PROJECT_UPDATED",
        message: `Project updated${statusNote}`,
        projectId: id,
        meta: { title: p.name },
      });
    });
  });
}

/** Deleting a project keeps its tasks; they simply become unassigned. */
export async function deleteProject(id: string): Promise<ActionResult> {
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const p = await tx.project.findUnique({ where: { id } });
      if (!p) return;
      await logActivity(tx, {
        type: "PROJECT_DELETED",
        message: `Project deleted: ${p.name} (its tasks were kept)`,
        meta: { title: p.name },
      });
      await tx.project.delete({ where: { id } });
    });
  });
}

// ---------- milestones ----------

export async function addMilestone(projectId: string, title: string, date: string): Promise<ActionResult> {
  const t = title.trim();
  if (!t) return { ok: false, error: "Milestone title is required" };
  if (!/^(\d{4}-\d{2}-\d{2})?$/.test(date)) return { ok: false, error: "Use a valid date" };
  return safe(async () => {
    await db.projectMilestone.create({ data: { projectId, title: t.slice(0, 200), dueDate: fromInputDate(date) } });
  });
}

export async function toggleMilestone(id: string, done: boolean): Promise<ActionResult> {
  return safe(async () => {
    await db.projectMilestone.update({ where: { id }, data: { completedAt: done ? new Date() : null } });
  });
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  return safe(async () => {
    await db.projectMilestone.delete({ where: { id } });
  });
}
