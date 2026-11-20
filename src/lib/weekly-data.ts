import { db } from "./db";
import { parseMeta } from "./activity";
import { taskCode } from "./constants";
import { addDays, dateKey, daysSince, parseDateKey } from "./dates";
import { titleSimilarity } from "./fuzzy";
import { issueCode } from "./issues";
import { mergeWeeklyConfig, shortDate, weekdayNameId, weekInfo, type WeeklyConfig, type WeeklyDraft, type WeeklyItem } from "./weekly";

export const WEEKLY_KEY = "weekly.config";

export async function getWeeklyConfig(): Promise<WeeklyConfig> {
  const pref = await db.userPreference.findUnique({ where: { key: WEEKLY_KEY } });
  if (!pref) return mergeWeeklyConfig({});
  try {
    return mergeWeeklyConfig(JSON.parse(pref.value));
  } catch {
    return mergeWeeklyConfig({});
  }
}

const STATUS_RANK: Record<string, number> = { "In Progress": 0, "In Review": 1, Blocked: 2, "Waiting for Others": 3, "To Do": 4 };

function planLabel(status: string, progress: number): string {
  if (status === "In Review") return "in review";
  if (status === "In Progress") return "in progress";
  if (status === "Blocked" || status === "Waiting for Others") return progress > 0 ? "in progress" : "planned"; // work on it goes on; the blocker is listed separately
  return "planned";
}

/**
 * Builds the three lists of the weekly email from your data.
 *  - Done last week: tasks finished last week, plus UAT features signed off last week.
 *  - This week: open work that is in progress or in review, or due by the end of the plan week, or high priority.
 *  - Blocked / At risk: blocked and long-waiting tasks, overdue tasks, serious open issues, projects marked At Risk.
 * `planStartKey` is the Monday of the week being planned; "last week" is the week before it.
 */
export async function buildWeeklyDraft(planStartKey: string, now: Date = new Date(), maxPlanItems = 10): Promise<WeeklyDraft> {
  const info = weekInfo(planStartKey);
  const planStart = parseDateKey(planStartKey);
  const lastStart = addDays(planStart, -7);
  const endKey = info.plan.endKey;

  const [doneTasks, activity, resolvedIssues, openTasks, openIssues, riskProjects] = await Promise.all([
    db.task.findMany({ where: { status: "Done", completedAt: { gte: lastStart, lt: planStart } }, orderBy: { completedAt: "asc" } }),
    db.taskActivity.findMany({ where: { type: "UAT_SIGNOFF", createdAt: { gte: lastStart, lt: planStart } }, orderBy: { createdAt: "asc" } }),
    db.issue.findMany({ where: { status: { in: ["Resolved", "Closed"] }, actualResolution: { gte: lastStart, lt: planStart } }, orderBy: { seq: "asc" } }),
    db.task.findMany({ where: { status: { notIn: ["Done", "Cancelled", "Backlog"] } }, orderBy: { seq: "asc" }, take: 2000 }),
    db.issue.findMany({ where: { status: { notIn: ["Resolved", "Closed"] } }, orderBy: { seq: "asc" } }),
    db.project.findMany({ where: { status: "At Risk" }, orderBy: { name: "asc" } }),
  ]);

  // ---- done last week
  const signedOff = new Map<string, Date>();
  for (const a of activity) {
    if (!/signed off/i.test(a.message)) continue; // "Sign-off requested" or "rejected" is not a sign-off
    const name = parseMeta(a.meta).title?.trim();
    if (name && !signedOff.has(name.toLowerCase())) signedOff.set(name.toLowerCase(), a.createdAt);
  }
  const signedNames = [...signedOff.keys()];
  const doneRows: { at: number; item: WeeklyItem }[] = [];
  for (const t of doneTasks) {
    if (signedNames.some((n) => titleSimilarity(t.title, n).dice >= 0.85)) continue; // the sign-off line says it better
    doneRows.push({ at: (t.completedAt ?? t.updatedAt).getTime(), item: { id: `done-task-${t.id}`, kind: "done", ref: taskCode(t.seq), text: `${t.title} — done (100%)`, included: true, source: "task" } });
  }
  const names = new Map(activity.map((a) => [parseMeta(a.meta).title?.trim().toLowerCase() ?? "", parseMeta(a.meta).title?.trim() ?? ""]));
  for (const [key, at] of signedOff) {
    doneRows.push({ at: at.getTime(), item: { id: `done-uat-${key}`, kind: "done", ref: "UAT", text: `${names.get(key)} — signed off (100%)`, included: true, source: "uat" } });
  }
  for (const i of resolvedIssues) {
    doneRows.push({ at: (i.actualResolution ?? i.updatedAt).getTime(), item: { id: `done-issue-${i.id}`, kind: "done", ref: issueCode(i.seq), text: `${issueCode(i.seq)} ${i.title} — resolved`, included: false, source: "issue" } });
  }
  const done = doneRows.sort((a, b) => a.at - b.at).map((r) => r.item);

  // ---- this week
  const view = openTasks.map((t) => ({ t, dueKey: t.dueDate ? dateKey(t.dueDate) : null }));
  const order = (a: (typeof view)[number], b: (typeof view)[number]) =>
    (a.dueKey ?? "9999-99-99").localeCompare(b.dueKey ?? "9999-99-99") || (STATUS_RANK[a.t.status] ?? 9) - (STATUS_RANK[b.t.status] ?? 9) || a.t.seq - b.t.seq;
  const planRows = view
    .filter(({ t, dueKey }) =>
      t.status === "In Progress" || t.status === "In Review" ||
      (["To Do", "Waiting for Others", "Blocked"].includes(t.status) && ((dueKey !== null && dueKey <= endKey) || t.priority === "Critical" || t.priority === "High")))
    .sort(order);
  const plan: WeeklyItem[] = planRows.map(({ t, dueKey }, i) => {
    const showPct = t.progress > 0 || t.status === "In Progress" || t.status === "In Review";
    const inWeek = dueKey !== null && dueKey >= planStartKey && dueKey <= endKey;
    const text = `${t.title} — ${planLabel(t.status, t.progress)}${showPct ? ` (${t.progress}%)` : ""}` +
      (t.nextAction?.trim() ? `, target: ${t.nextAction.trim()}` : "") +
      (inWeek ? `, ekspektasi selesai ${weekdayNameId(dueKey)}` : "");
    return { id: `plan-${t.id}`, kind: "plan", ref: taskCode(t.seq), text, included: i < maxPlanItems, source: "task" };
  });

  // ---- blocked / at risk
  const blocked: WeeklyItem[] = [];
  const add = (id: string, ref: string, text: string, included: boolean, source: WeeklyItem["source"]) => blocked.push({ id, kind: "blocked", ref, text, included, source });
  for (const { t } of view.filter((v) => v.t.status === "Blocked").sort(order)) {
    add(`blocked-${t.id}`, taskCode(t.seq), `${t.title} — ${t.blockerDescription?.trim() || "diblokir"}`, true, "task");
  }
  for (const { t } of view.filter((v) => v.t.status === "Waiting for Others").sort(order)) {
    const days = daysSince(t.blockedAt ?? t.updatedAt, now);
    const followUpDue = t.followUpDate ? dateKey(t.followUpDate) <= endKey : false;
    add(`waiting-${t.id}`, taskCode(t.seq), `${t.title} — menunggu ${t.waitingFor?.trim() || "pihak lain"}${days >= 3 ? ` (${days} hari)` : ""}`, days >= 2 || followUpDue, "task");
  }
  for (const { t, dueKey } of view.filter((v) => ["In Progress", "In Review", "To Do"].includes(v.t.status) && v.dueKey !== null && v.dueKey < planStartKey).sort(order)) {
    add(`overdue-${t.id}`, taskCode(t.seq), `${t.title} — melewati target ${shortDate(dueKey as string)} (${daysSince(t.dueDate as Date, now)} hari)`, true, "task");
  }
  for (const i of openIssues.filter((x) => x.severity === "High" || x.severity === "Critical" || x.status === "Escalated")) {
    add(`issue-${i.id}`, issueCode(i.seq), `${issueCode(i.seq)} ${i.title} — ${i.status.toLowerCase()}${i.responsiblePic?.trim() ? `, PIC ${i.responsiblePic.trim()}` : ""}`, i.severity === "High" || i.severity === "Critical", "issue");
  }
  for (const p of riskProjects) add(`project-${p.id}`, "Project", `${p.name} — proyek berstatus At Risk`, false, "project");

  return { info, planStartKey, done, plan, blocked };
}
