/**
 * Pure metric functions (no database access) so they can be unit-tested.
 *
 * PROJECT PROGRESS METHODOLOGY
 *   - Cancelled tasks are ignored.
 *   - A Done task counts as 100%.
 *   - Any other task counts as its own progress percentage (0-100).
 *   - Project progress = average of the counted tasks, rounded. No tasks = 0%.
 *
 * COMPLETION RATE
 *   - Done tasks / (all tasks - cancelled tasks), as a rounded percentage.
 */
export function projectProgress(tasks: { status: string; progress: number }[]): number {
  const counted = tasks.filter((t) => t.status !== "Cancelled");
  if (counted.length === 0) return 0;
  const total = counted.reduce((sum, t) => sum + (t.status === "Done" ? 100 : clamp(t.progress)), 0);
  return Math.round(total / counted.length);
}

export function completionRate(done: number, total: number, cancelled: number): number {
  const denominator = total - cancelled;
  if (denominator <= 0) return 0;
  return Math.round((done / denominator) * 100);
}

export type HealthLevel = "healthy" | "watch" | "at-risk" | "idle";

/**
 * PROJECT HEALTH RULES (first match wins)
 *   - Completed project            -> healthy
 *   - No tasks yet                 -> idle
 *   - On Hold                      -> watch
 *   - status "At Risk", any overdue task, or 2+ blocked tasks -> at-risk
 *   - 1 blocked task or any task waiting on others            -> watch
 *   - otherwise                    -> healthy
 */
export function projectHealth(input: {
  status: string;
  totalTasks: number;
  overdue: number;
  blocked: number;
  waiting: number;
}): { level: HealthLevel; reason: string } {
  if (input.status === "Completed") return { level: "healthy", reason: "Completed" };
  if (input.totalTasks === 0) return { level: "idle", reason: "No tasks yet" };
  if (input.status === "On Hold") return { level: "watch", reason: "On hold" };
  if (input.status === "At Risk") return { level: "at-risk", reason: "Marked at risk" };
  if (input.overdue > 0) return { level: "at-risk", reason: `${input.overdue} overdue` };
  if (input.blocked >= 2) return { level: "at-risk", reason: `${input.blocked} blocked` };
  if (input.blocked === 1) return { level: "watch", reason: "1 blocked" };
  if (input.waiting > 0) return { level: "watch", reason: `${input.waiting} waiting on others` };
  return { level: "healthy", reason: "On track" };
}

export function clamp(n: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, n));
}
