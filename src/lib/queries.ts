import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { CLOSED_STATUSES, PRIORITY_WEIGHT, TASK_STATUSES, type QuickFilter } from "./constants";
import { addDays, daysFromToday, startOfToday } from "./dates";
import { getEngineState } from "./engine-data";
import { quickFilterWhere } from "./filters";
import { fetchWindow, literalOnly } from "./like";
import { completionRate, projectHealth, projectProgress } from "./metrics";

export const taskInclude = {
  project: { select: { id: true, name: true } },
  tags: { include: { tag: true } },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export interface TaskListParams {
  q?: string;
  status?: string;
  priority?: string;
  project?: string;
  category?: string;
  quick?: QuickFilter;
  sort?: string;
  dir?: "asc" | "desc";
}

export async function listTasks(params: TaskListParams, now = new Date()): Promise<TaskRow[]> {
  const and: Prisma.TaskWhereInput[] = [];
  if (params.quick) and.push(quickFilterWhere(params.quick, now));
  if (params.status && (TASK_STATUSES as readonly string[]).includes(params.status)) {
    and.push({ status: params.status });
  }
  if (params.priority) and.push({ priority: params.priority });
  if (params.category) and.push({ category: params.category });
  if (params.project === "none") and.push({ projectId: null });
  else if (params.project) and.push({ projectId: params.project });
  const q = params.q?.trim();
  if (q) {
    and.push({
      OR: [
        { title: { contains: q } },
        { description: { contains: q } },
        { notes: { contains: q } },
        { assignee: { contains: q } },
        { stakeholder: { contains: q } },
        { nextAction: { contains: q } },
        { project: { name: { contains: q } } },
        { tags: { some: { tag: { name: { contains: q } } } } },
      ],
    });
  }

  const found = await db.task.findMany({ where: { AND: and }, include: taskInclude, take: fetchWindow(q ?? "", 1000) });
  const rows = literalOnly(found, q ?? "");
  return sortTasks(rows, params.sort ?? "smart", params.dir ?? "asc");
}

function sortTasks(rows: TaskRow[], sort: string, dir: "asc" | "desc"): TaskRow[] {
  const sign = dir === "desc" ? -1 : 1;
  const far = Number.MAX_SAFE_INTEGER;
  const closed = (t: TaskRow) => (CLOSED_STATUSES as readonly string[]).includes(t.status);
  const cmp: Record<string, (a: TaskRow, b: TaskRow) => number> = {
    // default: open tasks first, then by deadline, then by priority
    smart: (a, b) =>
      Number(closed(a)) - Number(closed(b)) ||
      (a.dueDate?.getTime() ?? far) - (b.dueDate?.getTime() ?? far) ||
      (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0),
    due: (a, b) => (a.dueDate?.getTime() ?? far) - (b.dueDate?.getTime() ?? far),
    priority: (a, b) => (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0),
    updated: (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    created: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    title: (a, b) => a.title.localeCompare(b.title),
    status: (a, b) => TASK_STATUSES.indexOf(a.status as never) - TASK_STATUSES.indexOf(b.status as never),
  };
  const fn = cmp[sort] ?? cmp.smart;
  return [...rows].sort((a, b) => sign * fn(a, b));
}

export async function getTask(id: string) {
  return db.task.findUnique({
    where: { id },
    include: {
      ...taskInclude,
      subtasks: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      attachments: { orderBy: { createdAt: "desc" } },
      dependsOn: { include: { dependsOn: { select: { id: true, seq: true, title: true, status: true, dueDate: true } } } },
      blocking: { include: { task: { select: { id: true, seq: true, title: true, status: true } } } },
      comments: { orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
}

export async function listDependencyCandidates(excludeId: string) {
  return db.task.findMany({
    where: { id: { not: excludeId }, status: { notIn: [...CLOSED_STATUSES] } },
    select: { id: true, seq: true, title: true },
    orderBy: { seq: "desc" },
    take: 300,
  });
}

export async function listProjectOptions() {
  return db.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function getDashboardData(now = new Date()) {
  const today = startOfToday(now);
  const count = (key: QuickFilter) => db.task.count({ where: quickFilterWhere(key, now) });

  const [active, dueToday, overdue, inProgress, waiting, blocked, completedWeek, totalAll, doneAll, cancelledAll] =
    await Promise.all([
      count("active"),
      count("due-today"),
      count("overdue"),
      count("in-progress"),
      count("waiting"),
      count("blocked"),
      count("completed-week"),
      db.task.count(),
      db.task.count({ where: { status: "Done" } }),
      db.task.count({ where: { status: "Cancelled" } }),
    ]);

  // Today's Focus now comes from the Smart Next Action Engine (src/lib/engine.ts).
  const engine = await getEngineState(now);
  const focus = engine.recommendations.slice(0, 5);

  const upcoming = await db.task.findMany({
    where: { ...quickFilterWhere("active", now), dueDate: { gte: today, lt: addDays(today, 8) } },
    include: taskInclude,
    orderBy: { dueDate: "asc" },
    take: 12,
  });

  const projects = await db.project.findMany({
    where: { status: { in: ["Active", "At Risk"] } },
    include: {
      tasks: { select: { status: true, progress: true, dueDate: true } },
      _count: { select: { milestones: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const openIssues = await db.issue.groupBy({
    by: ["projectId"],
    where: { status: { notIn: ["Resolved", "Closed"] }, projectId: { not: null } },
    _count: { _all: true },
  });
  const issuesByProject = new Map(openIssues.map((r) => [r.projectId, r._count._all]));
  const projectCards = projects.map((p) => buildProjectStats(p, p.tasks, issuesByProject.get(p.id) ?? 0, now));

  const recent = await db.taskActivity.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { task: { select: { id: true, seq: true, title: true } } },
  });

  return {
    counts: {
      active,
      dueToday,
      overdue,
      inProgress,
      waiting,
      blocked,
      completedWeek,
      completionRate: completionRate(doneAll, totalAll, cancelledAll),
      totalAll,
    },
    focus,
    followUpDays: engine.settings.followUpSnoozeDays,
    upcoming,
    projects: projectCards,
    recent,
  };
}

export function buildProjectStats(
  project: { id: string; name: string; status: string; targetDate: Date | null },
  tasks: { status: string; progress: number; dueDate: Date | null }[],
  openIssues: number,
  now: Date,
) {
  const open = tasks.filter((t) => !(CLOSED_STATUSES as readonly string[]).includes(t.status));
  const overdue = open.filter((t) => t.dueDate && daysFromToday(t.dueDate, now) < 0).length;
  const blocked = tasks.filter((t) => t.status === "Blocked").length;
  const waiting = tasks.filter((t) => t.status === "Waiting for Others").length;
  const upcoming = open.filter((t) => t.dueDate && daysFromToday(t.dueDate, now) >= 0 && daysFromToday(t.dueDate, now) <= 7).length;
  const total = tasks.filter((t) => t.status !== "Cancelled").length;
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    targetDate: project.targetDate,
    progress: projectProgress(tasks),
    totalTasks: total,
    completedTasks: tasks.filter((t) => t.status === "Done").length,
    blocked,
    overdue,
    upcoming,
    openIssues,
    health: projectHealth({ status: project.status, totalTasks: total, overdue, blocked, waiting }),
  };
}

export async function listProjectsWithStats(now = new Date()) {
  const projects = await db.project.findMany({
    include: { tasks: { select: { status: true, progress: true, dueDate: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const issues = await db.issue.groupBy({
    by: ["projectId"],
    where: { status: { notIn: ["Resolved", "Closed"] }, projectId: { not: null } },
    _count: { _all: true },
  });
  const byProject = new Map(issues.map((r) => [r.projectId, r._count._all]));
  return projects.map((p) => ({
    project: p,
    stats: buildProjectStats(p, p.tasks, byProject.get(p.id) ?? 0, now),
  }));
}

export async function getProjectDetail(id: string, now = new Date()) {
  const project = await db.project.findUnique({
    where: { id },
    include: {
      tasks: { include: taskInclude, orderBy: [{ dueDate: "asc" }] },
      milestones: { orderBy: { dueDate: "asc" } },
      uatFeatures: { select: { id: true, name: true, status: true, signOffStatus: true }, orderBy: { createdAt: "desc" } },
      issues: { where: { status: { notIn: ["Resolved", "Closed"] } }, select: { id: true, seq: true, title: true, status: true, severity: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) return null;
  const openIssues = await db.issue.count({
    where: { projectId: id, status: { notIn: ["Resolved", "Closed"] } },
  });
  const activities = await db.taskActivity.findMany({
    where: { OR: [{ projectId: id }, { task: { projectId: id } }] },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { task: { select: { id: true, seq: true, title: true } } },
  });
  return { project, stats: buildProjectStats(project, project.tasks, openIssues, now), activities };
}

export async function listActivities(take = 100) {
  return db.taskActivity.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { task: { select: { id: true, seq: true, title: true } } },
  });
}
