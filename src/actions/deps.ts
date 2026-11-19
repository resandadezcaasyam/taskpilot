"use server";

import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { taskCode } from "@/lib/constants";
import type { ActionResult } from "@/lib/validators";
import { safe } from "./_shared";

/** True if `target` can already be reached from `from` by following "depends on" links. */
async function reaches(from: string, target: string): Promise<boolean> {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const id = stack.pop() as string;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const next = await db.taskDependency.findMany({ where: { taskId: id }, select: { dependsOnTaskId: true } });
    stack.push(...next.map((n) => n.dependsOnTaskId));
  }
  return false;
}

export async function addDependency(taskId: string, dependsOnTaskId: string): Promise<ActionResult> {
  if (taskId === dependsOnTaskId) return { ok: false, error: "A task cannot depend on itself" };
  if (await reaches(dependsOnTaskId, taskId)) {
    return { ok: false, error: "That would create a circular dependency" };
  }
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const [t, dep] = await Promise.all([
        tx.task.findUnique({ where: { id: taskId } }),
        tx.task.findUnique({ where: { id: dependsOnTaskId } }),
      ]);
      if (!t || !dep) throw new Error("Task no longer exists");
      await tx.taskDependency.upsert({
        where: { taskId_dependsOnTaskId: { taskId, dependsOnTaskId } },
        create: { taskId, dependsOnTaskId },
        update: {},
      });
      await logActivity(tx, {
        type: "DEPENDENCY_CHANGED", message: `Now depends on ${taskCode(dep.seq)} ${dep.title}`,
        taskId, projectId: t.projectId, meta: { code: taskCode(t.seq), title: t.title },
      });
    });
  });
}

export async function removeDependency(id: string): Promise<ActionResult> {
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const d = await tx.taskDependency.findUnique({ where: { id }, include: { task: true, dependsOn: true } });
      if (!d) return;
      await tx.taskDependency.delete({ where: { id } });
      await logActivity(tx, {
        type: "DEPENDENCY_CHANGED", message: `No longer depends on ${taskCode(d.dependsOn.seq)} ${d.dependsOn.title}`,
        taskId: d.taskId, projectId: d.task.projectId, meta: { code: taskCode(d.task.seq), title: d.task.title },
      });
    });
  });
}
