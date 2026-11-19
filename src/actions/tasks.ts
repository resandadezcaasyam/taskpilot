"use server";

import { z } from "zod";
import type { UpdatePatch } from "@/lib/brain-plan";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskCode,
  type ActivityType,
} from "@/lib/constants";
import { formatDate, fromInputDate } from "@/lib/dates";
import { taskFormSchema, type ActionResult, type TaskFormValues } from "@/lib/validators";
import { nextSeq, safe } from "./_shared";

type TaskData = Partial<Omit<Prisma.TaskUncheckedUpdateInput, "tags">>;

const idSchema = z.string().min(1);
const statusSchema = z.enum(TASK_STATUSES);
const prioritySchema = z.enum(TASK_PRIORITIES);

const text = (s: string) => s.trim() || null;
const hoursToMinutes = (s: string) => (s ? Math.round(Number(s) * 60) : null);

function formToData(v: TaskFormValues): TaskData {
  return {
    title: v.title.trim(),
    description: text(v.description),
    projectId: v.projectId || null,
    category: v.category,
    priority: v.priority,
    status: v.status,
    startDate: fromInputDate(v.startDate),
    dueDate: fromInputDate(v.dueDate),
    assignee: text(v.assignee),
    stakeholder: text(v.stakeholder),
    estimatedMinutes: hoursToMinutes(v.estimatedHours),
    actualMinutes: hoursToMinutes(v.actualHours),
    progress: Number(v.progress),
    businessImportance: Number(v.businessImportance),
    nextAction: text(v.nextAction),
    nextActionDue: fromInputDate(v.nextActionDue),
    blockerDescription: text(v.blockerDescription),
    waitingFor: text(v.waitingFor),
    followUpDate: fromInputDate(v.followUpDate),
    notes: text(v.notes),
  };
}

function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const name = part.trim().toLowerCase();
    if (name) seen.add(name.slice(0, 40));
  }
  return [...seen];
}

const same = (a: unknown, b: unknown) =>
  a instanceof Date || b instanceof Date
    ? (a as Date | null)?.getTime?.() === (b as Date | null)?.getTime?.()
    : (a ?? null) === (b ?? null);

async function setTags(tx: Tx, taskId: string, names: string[]) {
  await tx.taskTag.deleteMany({ where: { taskId } });
  for (const name of names) {
    const tag = await tx.tag.upsert({ where: { name }, create: { name }, update: {} });
    await tx.taskTag.create({ data: { taskId, tagId: tag.id } });
  }
}

/**
 * The single place where a task changes. Handles status side-effects
 * (completion date, blocker timestamps) and writes the activity log.
 */
async function applyTaskPatch(tx: Tx, id: string, patch: TaskData, tagNames?: string[]) {
  const before = await tx.task.findUnique({ where: { id } });
  if (!before) throw new Error("Task no longer exists");

  const now = new Date();
  const data: TaskData = { ...patch };
  const toStatus = (patch.status as string | undefined) ?? before.status;
  const statusChanged = toStatus !== before.status;
  const title = (patch.title as string | undefined) ?? before.title;

  if (statusChanged) {
    if (toStatus === "Done") {
      data.completedAt = now;
      data.progress = 100;
    } else {
      data.completedAt = null;
    }
    const holding = toStatus === "Blocked" || toStatus === "Waiting for Others";
    data.blockedAt = holding ? (before.blockedAt ?? now) : null;
    if (before.status === "Blocked" && toStatus !== "Blocked" && patch.blockerDescription === undefined) {
      data.blockerDescription = null;
    }
    if (before.status === "Waiting for Others" && toStatus !== "Waiting for Others" && patch.waitingFor === undefined) {
      data.waitingFor = null;
    }
  }

  if (Object.keys(data).length > 0) await tx.task.update({ where: { id }, data });
  if (tagNames) await setTags(tx, id, tagNames);

  // ---- activity log ----
  const meta = { code: taskCode(before.seq), title };
  const base = { taskId: id, projectId: before.projectId, meta };
  const log = (type: ActivityType, message: string) => logActivity(tx, { type, message, ...base });

  if (statusChanged) {
    if (toStatus === "Done") await log("TASK_COMPLETED", "Marked as done");
    else if (before.status === "Done") await log("TASK_REOPENED", `Reopened as ${toStatus}`);
    else await log("STATUS_CHANGED", `Status changed from ${before.status} to ${toStatus}`);
    if (toStatus === "Blocked") {
      await log("BLOCKER_ADDED", `Blocked: ${(patch.blockerDescription as string) || before.blockerDescription || "no reason recorded"}`);
    }
    if (before.status === "Blocked" && toStatus !== "Blocked") {
      await log("BLOCKER_RESOLVED", `Blocker cleared${before.blockerDescription ? `: ${before.blockerDescription}` : ""}`);
    }
  }
  if (patch.priority !== undefined && patch.priority !== before.priority) {
    await log("PRIORITY_CHANGED", `Priority changed from ${before.priority} to ${patch.priority}`);
  }
  if (patch.dueDate !== undefined && !same(patch.dueDate, before.dueDate)) {
    const from = before.dueDate ? formatDate(before.dueDate) : "no deadline";
    const to = patch.dueDate ? formatDate(patch.dueDate as Date) : "no deadline";
    await log("DEADLINE_CHANGED", `Deadline changed from ${from} to ${to}`);
  }
  if (!statusChanged && patch.progress !== undefined && patch.progress !== before.progress) {
    await log("PROGRESS_UPDATED", `Progress updated from ${before.progress}% to ${patch.progress}%`);
  }

  const handled = new Set(["status", "priority", "dueDate", "progress"]);
  const detailChanged = Object.entries(patch).some(
    ([key, value]) => !handled.has(key) && !same(value, (before as Record<string, unknown>)[key]),
  );
  if (detailChanged || tagNames) await log("TASK_UPDATED", "Task details updated");
  return before;
}

/** Inserts one task (number, tags, activity log) inside an existing transaction. */
async function insertTask(tx: Tx, v: TaskFormValues): Promise<{ id: string; seq: number; title: string }> {
  const seq = await nextSeq(tx, "task");
  const data = formToData(v);
  const done = v.status === "Done";
  const holding = v.status === "Blocked" || v.status === "Waiting for Others";
  const task = await tx.task.create({
    data: {
      ...(data as Prisma.TaskUncheckedCreateInput),
      seq,
      progress: done ? 100 : Number(v.progress),
      completedAt: done ? new Date() : null,
      blockedAt: holding ? new Date() : null,
    },
  });
  await setTags(tx, task.id, parseTags(v.tags));
  await logActivity(tx, {
    type: "TASK_CREATED",
    message: "Task created",
    taskId: task.id,
    projectId: task.projectId,
    meta: { code: taskCode(seq), title: task.title },
  });
  if (v.status === "Blocked") {
    await logActivity(tx, {
      type: "BLOCKER_ADDED",
      message: `Blocked: ${v.blockerDescription.trim()}`,
      taskId: task.id,
      projectId: task.projectId,
      meta: { code: taskCode(seq), title: task.title },
    });
  }
  return { id: task.id, seq, title: task.title };
}

export async function createTask(input: TaskFormValues): Promise<ActionResult<{ id: string }>> {
  const parsed = taskFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid task" };
  const v = parsed.data;
  return safe(() =>
    db.$transaction(async (tx) => {
      const t = await insertTask(tx, v);
      return { id: t.id };
    }),
  );
}

export async function updateTask(id: string, input: TaskFormValues): Promise<ActionResult> {
  const parsed = taskFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid task" };
  const v = parsed.data;
  return safe(async () => {
    await db.$transaction((tx) => applyTaskPatch(tx, idSchema.parse(id), formToData(v), parseTags(v.tags)));
  });
}

export async function setTaskStatus(id: string, status: string): Promise<ActionResult> {
  const s = statusSchema.safeParse(status);
  if (!s.success) return { ok: false, error: "Unknown status" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const t = await tx.task.findUnique({ where: { id } });
      if (!t) throw new Error("Task no longer exists");
      if (s.data === "Blocked" && !t.blockerDescription) {
        throw new Error("Open the task and describe the blocker before marking it as blocked");
      }
      if (s.data === "Waiting for Others" && !t.waitingFor) {
        throw new Error("Open the task and say who you are waiting for first");
      }
      await applyTaskPatch(tx, id, { status: s.data });
    });
  });
}

export async function completeTask(id: string) {
  return setTaskStatus(id, "Done");
}

export async function reopenTask(id: string) {
  return setTaskStatus(id, "To Do");
}

export async function setTaskPriority(id: string, priority: string): Promise<ActionResult> {
  const p = prioritySchema.safeParse(priority);
  if (!p.success) return { ok: false, error: "Unknown priority" };
  return safe(async () => {
    await db.$transaction((tx) => applyTaskPatch(tx, id, { priority: p.data }));
  });
}

export async function setTaskDueDate(id: string, date: string): Promise<ActionResult> {
  if (!/^(\d{4}-\d{2}-\d{2})?$/.test(date)) return { ok: false, error: "Use a valid date" };
  return safe(async () => {
    await db.$transaction((tx) => applyTaskPatch(tx, id, { dueDate: fromInputDate(date) }));
  });
}

export async function setTaskProgress(id: string, progress: number): Promise<ActionResult> {
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    return { ok: false, error: "Progress must be between 0 and 100" };
  }
  return safe(async () => {
    await db.$transaction((tx) => applyTaskPatch(tx, id, { progress }));
  });
}

export async function duplicateTask(id: string): Promise<ActionResult<{ id: string }>> {
  return safe(() =>
    db.$transaction(async (tx) => {
      const src = await tx.task.findUnique({
        where: { id },
        include: { tags: true, subtasks: true },
      });
      if (!src) throw new Error("Task no longer exists");
      const seq = await nextSeq(tx, "task");
      const copy = await tx.task.create({
        data: {
          seq,
          title: `Copy of ${src.title}`.slice(0, 200),
          description: src.description,
          projectId: src.projectId,
          category: src.category,
          priority: src.priority,
          status: "To Do",
          startDate: src.startDate,
          dueDate: src.dueDate,
          assignee: src.assignee,
          stakeholder: src.stakeholder,
          estimatedMinutes: src.estimatedMinutes,
          businessImportance: src.businessImportance,
          nextAction: src.nextAction,
          notes: src.notes,
          progress: 0,
        },
      });
      for (const t of src.tags) await tx.taskTag.create({ data: { taskId: copy.id, tagId: t.tagId } });
      for (const s of src.subtasks) {
        await tx.subtask.create({ data: { taskId: copy.id, title: s.title, position: s.position } });
      }
      await logActivity(tx, {
        type: "TASK_CREATED",
        message: `Duplicated from ${taskCode(src.seq)}`,
        taskId: copy.id,
        projectId: copy.projectId,
        meta: { code: taskCode(seq), title: copy.title },
      });
      return { id: copy.id };
    }),
  );
}

export async function deleteTask(id: string): Promise<ActionResult> {
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const t = await tx.task.findUnique({ where: { id } });
      if (!t) return;
      await logActivity(tx, {
        type: "TASK_DELETED",
        message: "Task deleted",
        projectId: t.projectId,
        meta: { code: taskCode(t.seq), title: t.title },
      });
      await tx.task.delete({ where: { id } });
    });
  });
}

export async function bulkUpdateTasks(
  ids: string[],
  change: { status?: string; priority?: string; delete?: boolean },
): Promise<ActionResult<{ changed: number; skipped: number }>> {
  if (ids.length === 0) return { ok: false, error: "Select at least one task" };
  if (change.status && !statusSchema.safeParse(change.status).success) return { ok: false, error: "Unknown status" };
  if (change.priority && !prioritySchema.safeParse(change.priority).success) return { ok: false, error: "Unknown priority" };

  return safe(() =>
    db.$transaction(async (tx) => {
      let changed = 0;
      let skipped = 0;
      for (const id of ids) {
        const t = await tx.task.findUnique({ where: { id } });
        if (!t) continue;
        if (change.delete) {
          await logActivity(tx, {
            type: "TASK_DELETED",
            message: "Task deleted",
            projectId: t.projectId,
            meta: { code: taskCode(t.seq), title: t.title },
          });
          await tx.task.delete({ where: { id } });
          changed++;
          continue;
        }
        const patch: TaskData = {};
        if (change.priority) patch.priority = change.priority;
        if (change.status) {
          // Blocked / waiting need context, so bulk moves skip tasks that lack it.
          const needsBlocker = change.status === "Blocked" && !t.blockerDescription;
          const needsWaiting = change.status === "Waiting for Others" && !t.waitingFor;
          if (needsBlocker || needsWaiting) {
            skipped++;
            continue;
          }
          patch.status = change.status;
        }
        await applyTaskPatch(tx, id, patch);
        changed++;
      }
      return { changed, skipped };
    }),
  );
}

// ---------- subtasks & comments ----------

export async function addSubtask(taskId: string, title: string): Promise<ActionResult> {
  const t = title.trim();
  if (!t) return { ok: false, error: "Subtask title is required" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const count = await tx.subtask.count({ where: { taskId } });
      await tx.subtask.create({ data: { taskId, title: t.slice(0, 200), position: count } });
      const task = await tx.task.update({ where: { id: taskId }, data: {} });
      await logActivity(tx, {
        type: "SUBTASK_ADDED",
        message: `Subtask added: ${t}`,
        taskId,
        projectId: task.projectId,
        meta: { code: taskCode(task.seq), title: task.title },
      });
    });
  });
}

export async function toggleSubtask(id: string, done: boolean): Promise<ActionResult> {
  return safe(async () => {
    await db.subtask.update({ where: { id }, data: { done, completedAt: done ? new Date() : null } });
  });
}

export async function deleteSubtask(id: string): Promise<ActionResult> {
  return safe(async () => {
    await db.subtask.delete({ where: { id } });
  });
}

export async function addComment(taskId: string, body: string): Promise<ActionResult> {
  const b = body.trim();
  if (!b) return { ok: false, error: "Write a comment first" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      await tx.taskComment.create({ data: { taskId, body: b.slice(0, 5000) } });
      const task = await tx.task.update({ where: { id: taskId }, data: {} });
      await logActivity(tx, {
        type: "COMMENT_ADDED",
        message: "Comment added",
        taskId,
        projectId: task.projectId,
        meta: { code: taskCode(task.seq), title: task.title },
      });
    });
  });
}

export async function deleteComment(id: string): Promise<ActionResult> {
  return safe(async () => {
    await db.taskComment.delete({ where: { id } });
  });
}

/**
 * Kanban move. Blocked and Waiting need context, which the board collects in a dialog before calling this.
 */
export async function moveTask(
  id: string,
  status: string,
  context?: { blockerDescription?: string; waitingFor?: string },
): Promise<ActionResult> {
  const s = statusSchema.safeParse(status);
  if (!s.success) return { ok: false, error: "Unknown status" };
  return safe(async () => {
    await db.$transaction(async (tx) => {
      const t = await tx.task.findUnique({ where: { id } });
      if (!t) throw new Error("Task no longer exists");
      const patch: TaskData = { status: s.data };
      if (s.data === "Blocked") {
        const blocker = context?.blockerDescription?.trim() || t.blockerDescription;
        if (!blocker) throw new Error("Describe what is blocking this task first");
        if (context?.blockerDescription?.trim()) patch.blockerDescription = blocker.slice(0, 2000);
      }
      if (s.data === "Waiting for Others") {
        const who = context?.waitingFor?.trim() || t.waitingFor;
        if (!who) throw new Error("Say who you are waiting for first");
        if (context?.waitingFor?.trim()) patch.waitingFor = who.slice(0, 200);
      }
      await applyTaskPatch(tx, id, patch);
    });
  });
}

export interface BulkResult {
  created: { index: number; id: string; code: string; title: string }[];
  failed: { index: number; error: string }[];
}

/**
 * Brain Dump: creates many tasks at once. Every row is validated with the same rules as the normal form.
 * Valid rows are saved together in ONE transaction (all or nothing); invalid rows are reported back with the
 * reason and are not saved, so nothing is ever half-created.
 */
export async function createTasksBulk(rows: TaskFormValues[]): Promise<ActionResult<BulkResult>> {
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "There is nothing to create." };
  if (rows.length > 100) return { ok: false, error: "Create at most 100 tasks at a time." };
  const projectIds = new Set((await db.project.findMany({ select: { id: true } })).map((p) => p.id));
  const failed: BulkResult["failed"] = [];
  const valid: { index: number; v: TaskFormValues }[] = [];
  rows.forEach((row, index) => {
    const p = taskFormSchema.safeParse(row);
    if (!p.success) failed.push({ index, error: p.error.issues[0]?.message ?? "Invalid task" });
    else if (p.data.projectId && !projectIds.has(p.data.projectId)) failed.push({ index, error: "That project no longer exists" });
    else valid.push({ index, v: p.data });
  });
  if (valid.length === 0) return { ok: true, data: { created: [], failed } };
  return safe(() =>
    db.$transaction(
      async (tx) => {
        const created: BulkResult["created"] = [];
        for (const { index, v } of valid) {
          const t = await insertTask(tx, v);
          created.push({ index, id: t.id, code: taskCode(t.seq), title: t.title });
        }
        return { created, failed };
      },
      { maxWait: 10_000, timeout: 60_000 },
    ),
  );
}

/** For each title, the code of an OPEN task that already has the same title (case-insensitive). */
export async function checkDuplicates(titles: string[]): Promise<ActionResult<Record<string, string>>> {
  try {
    const wanted = new Set(titles.slice(0, 200).map((t) => t.trim().toLowerCase()).filter(Boolean));
    if (wanted.size === 0) return { ok: true, data: {} };
    const open = await db.task.findMany({ where: { status: { notIn: ["Done", "Cancelled"] } }, select: { title: true, seq: true }, orderBy: { seq: "desc" }, take: 5000 });
    const found: Record<string, string> = {};
    for (const t of open) {
      const k = t.title.trim().toLowerCase();
      if (wanted.has(k) && !found[k]) found[k] = taskCode(t.seq);
    }
    return { ok: true, data: found };
  } catch {
    return { ok: false, error: "Could not check for duplicates" };
  }
}

// ---------------------------------------------------------------- Brain Dump: create + update + new projects

export type BrainDumpRow =
  | { kind: "create"; values: TaskFormValues }
  | { kind: "update"; taskId: string; patch: UpdatePatch };
export type BrainDumpRowResult =
  | { index: number; kind: "created" | "updated"; id: string; code: string; title: string }
  | { index: number; error: string };
export interface BrainDumpResult { rows: BrainDumpRowResult[]; newProjects: string[] }

const dateStr = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/);
const updatePatchSchema = z
  .object({
    status: statusSchema, progress: z.string().regex(/^(100|[1-9]?\d)$/), priority: prioritySchema, dueDate: dateStr, followUpDate: dateStr,
    estimatedHours: z.string().regex(/^\d+(\.\d+)?$/), nextAction: z.string().max(500), blockerDescription: z.string().max(2000),
    waitingFor: z.string().max(200), projectId: z.string().max(200), tags: z.string().max(300),
  })
  .partial()
  .strict();
const normName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const NEW_PREFIX = "new:";

/**
 * Applies a reviewed Brain Dump: creates tasks, updates existing tasks the user confirmed as the same task, and
 * creates projects that did not exist yet. Every row is validated first; valid rows are saved together in ONE
 * transaction (all or nothing) and invalid rows are returned with the reason.
 */
export async function applyBrainDump(input: BrainDumpRow[]): Promise<ActionResult<BrainDumpResult>> {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: "There is nothing to save." };
  if (input.length > 100) return { ok: false, error: "Save at most 100 lines at a time." };

  const projects = await db.project.findMany({ select: { id: true, name: true } });
  const projectIds = new Set(projects.map((p) => p.id));
  const projectByName = new Map(projects.map((p) => [normName(p.name), p.id]));
  const updateIds = [...new Set(input.filter((r) => r?.kind === "update").map((r) => (r as { taskId: string }).taskId))];
  const existing = new Map(
    (await db.task.findMany({ where: { id: { in: updateIds } }, include: { tags: { include: { tag: true } } } })).map((t) => [t.id, t]),
  );

  type Ready =
    | { index: number; kind: "create"; v: TaskFormValues; newProject?: string }
    | { index: number; kind: "update"; taskId: string; patch: z.infer<typeof updatePatchSchema>; newProject?: string };
  const results: BrainDumpRowResult[] = [];
  const ready: Ready[] = [];
  const fail = (index: number, error: string) => results.push({ index, error });
  const checkProject = (index: number, raw: string): { ok: boolean; newProject?: string } => {
    if (raw.startsWith(NEW_PREFIX)) {
      const name = raw.slice(NEW_PREFIX.length).trim().slice(0, 150);
      if (name.length < 2) return (fail(index, "Give the new project a name"), { ok: false });
      return { ok: true, newProject: name };
    }
    if (raw && !projectIds.has(raw)) return (fail(index, "That project no longer exists"), { ok: false });
    return { ok: true };
  };

  input.forEach((row, index) => {
    if (!row || typeof row !== "object") return fail(index, "Invalid row");
    if (row.kind === "create") {
      const raw = String(row.values?.projectId ?? "");
      const p = taskFormSchema.safeParse({ ...row.values, projectId: raw.startsWith(NEW_PREFIX) ? "" : raw });
      if (!p.success) return fail(index, p.error.issues[0]?.message ?? "Invalid task");
      const proj = checkProject(index, raw);
      if (proj.ok) ready.push({ index, kind: "create", v: p.data, newProject: proj.newProject });
      return;
    }
    if (row.kind === "update") {
      const t = existing.get(row.taskId);
      if (!t) return fail(index, "That task no longer exists");
      const p = updatePatchSchema.safeParse(row.patch);
      if (!p.success) return fail(index, "The changes are not valid");
      if (Object.keys(p.data).length === 0) return fail(index, "Nothing to change on that task");
      if (p.data.status === "Blocked" && !(p.data.blockerDescription?.trim() || t.blockerDescription)) return fail(index, "Describe what is blocking this task");
      if (p.data.status === "Waiting for Others" && !(p.data.waitingFor?.trim() || t.waitingFor)) return fail(index, "Say who you are waiting for");
      const proj = p.data.projectId ? checkProject(index, p.data.projectId) : { ok: true as const };
      if (proj.ok) ready.push({ index, kind: "update", taskId: row.taskId, patch: p.data, newProject: proj.newProject });
      return;
    }
    fail(index, "Invalid row");
  });
  if (ready.length === 0) return { ok: true, data: { rows: results.sort((a, b) => a.index - b.index), newProjects: [] } };

  return safe(() =>
    db.$transaction(
      async (tx) => {
        // projects that do not exist yet (once per name, reusing one that appeared in the meantime)
        const idByName = new Map(projectByName);
        const newProjects: string[] = [];
        for (const r of ready) {
          if (!r.newProject || idByName.has(normName(r.newProject))) continue;
          const created = await tx.project.create({ data: { name: r.newProject, priority: "Medium", status: "Active" } });
          idByName.set(normName(r.newProject), created.id);
          newProjects.push(r.newProject);
          await logActivity(tx, { type: "PROJECT_CREATED", message: `Project created: ${created.name}`, projectId: created.id, meta: { title: created.name } });
        }
        for (const r of ready) {
          if (r.kind === "create") {
            const v = r.newProject ? { ...r.v, projectId: idByName.get(normName(r.newProject)) as string } : r.v;
            const t = await insertTask(tx, v);
            results.push({ index: r.index, kind: "created", id: t.id, code: taskCode(t.seq), title: t.title });
            continue;
          }
          const cur = existing.get(r.taskId) as NonNullable<ReturnType<typeof existing.get>>;
          const pt = r.patch;
          const data: TaskData = {};
          if (pt.status) data.status = pt.status;
          if (pt.progress !== undefined && pt.status !== "Done") data.progress = Number(pt.progress);
          if (pt.priority) data.priority = pt.priority;
          if (pt.dueDate) data.dueDate = fromInputDate(pt.dueDate);
          if (pt.followUpDate) data.followUpDate = fromInputDate(pt.followUpDate);
          if (pt.estimatedHours) data.estimatedMinutes = Math.round(Number(pt.estimatedHours) * 60);
          if (pt.nextAction?.trim()) data.nextAction = pt.nextAction.trim();
          if (pt.blockerDescription?.trim()) data.blockerDescription = pt.blockerDescription.trim();
          if (pt.waitingFor?.trim()) data.waitingFor = pt.waitingFor.trim();
          if (pt.projectId) data.projectId = r.newProject ? (idByName.get(normName(r.newProject)) as string) : pt.projectId;
          const mergedTags = pt.tags ? [...new Set([...cur.tags.map((x) => x.tag.name), ...parseTags(pt.tags)])] : undefined;
          await applyTaskPatch(tx, r.taskId, data, mergedTags);
          results.push({ index: r.index, kind: "updated", id: cur.id, code: taskCode(cur.seq), title: cur.title });
        }
        return { rows: results.sort((a, b) => a.index - b.index), newProjects };
      },
      { maxWait: 10_000, timeout: 60_000 },
    ),
  );
}
