import { db } from "./db";
import { blockerStats, createdInRange, distribution, resolveRange, series, summarize, trendSeries } from "./analytics";
import { TASK_PRIORITIES, TASK_STATUSES } from "./constants";
import { dateKey } from "./dates";
import { listProjectsWithStats } from "./queries";
import { listUatFeatures } from "./uat-data";

export async function getAnalytics(params: { range?: string; from?: string; to?: string }, now = new Date()) {
  const [tasks, projects, events] = await Promise.all([
    db.task.findMany({ select: { id: true, status: true, priority: true, category: true, projectId: true, dueDate: true, createdAt: true, completedAt: true } }),
    db.project.findMany({ select: { id: true, name: true } }),
    db.taskActivity.findMany({ where: { type: { in: ["BLOCKER_ADDED", "BLOCKER_RESOLVED"] } }, select: { taskId: true, type: true, createdAt: true } }),
  ]);
  const earliest = tasks.length ? dateKey(new Date(Math.min(...tasks.map((t) => t.createdAt.getTime())))) : null;
  const range = resolveRange(params, dateKey(now), earliest);
  const cohort = createdInRange(tasks, range);
  const names = new Map(projects.map((p) => [p.id, p.name]));

  const [projectStats, uat] = await Promise.all([listProjectsWithStats(now), listUatFeatures({}, now)]);
  return {
    range,
    summary: summarize(tasks, range, now),
    blockers: blockerStats(events, range, now),
    trend: trendSeries(tasks, range),
    weekly: series(tasks, range, "week"),
    monthly: series(tasks, range, "month"),
    byStatus: distribution(cohort, (t) => t.status, TASK_STATUSES),
    byPriority: distribution(cohort, (t) => t.priority, TASK_PRIORITIES),
    byCategory: distribution(cohort, (t) => t.category),
    byProject: distribution(cohort, (t) => (t.projectId ? (names.get(t.projectId) ?? "Deleted project") : "No project")),
    projectProgress: projectStats.filter((p) => p.project.status !== "Completed").map((p) => ({ name: p.project.name, progress: p.stats.progress })),
    uatExecution: uat
      .filter((u) => u.counts.total > 0)
      .slice(0, 10)
      .map((u) => ({ name: u.feature.name, passed: u.counts.passed, failed: u.counts.failed, blocked: u.counts.blocked, notRun: u.counts.notRun })),
    totalTasks: tasks.length,
  };
}
