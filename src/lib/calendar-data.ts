import { db } from "./db";
import { CLOSED_STATUSES, taskCode } from "./constants";
import type { CalEvent } from "./calendar";
import { addDaysKey } from "./calendar";
import { dateKey, daysFromToday, parseDateKey } from "./dates";
import { issueCode } from "./issues";

/** All dated items between two Jakarta calendar days (inclusive). */
export async function getCalendarEvents(from: string, to: string, now = new Date()): Promise<CalEvent[]> {
  const start = parseDateKey(from);
  const end = parseDateKey(addDaysKey(to, 1));
  const inRange = { gte: start, lt: end };
  const open = { notIn: [...CLOSED_STATUSES] };

  const [due, followUps, issues, uat, milestones, plan] = await Promise.all([
    db.task.findMany({ where: { dueDate: inRange, status: { not: "Cancelled" } }, include: { project: { select: { name: true } } } }),
    db.task.findMany({ where: { followUpDate: inRange, status: open } }),
    db.issue.findMany({ where: { nextFollowUpDate: inRange, status: { notIn: ["Resolved", "Closed"] } } }),
    db.uatFeature.findMany({ where: { targetDate: inRange, status: { not: "Completed" } } }),
    db.projectMilestone.findMany({ where: { dueDate: inRange }, include: { project: { select: { id: true, name: true } } } }),
    db.planItem.findMany({ where: { date: { gte: from, lte: to }, status: { not: "Dropped" } }, include: { task: { select: { id: true, seq: true, title: true } } } }),
  ]);

  const ev: CalEvent[] = [];
  for (const t of due) {
    const done = t.status === "Done";
    ev.push({
      id: `task-due:${t.id}`, kind: "task-due", entityId: t.id, date: dateKey(t.dueDate as Date), title: t.title,
      subtitle: `${taskCode(t.seq)}${t.project ? ` · ${t.project.name}` : ""}`, href: `/tasks/${t.id}`, done,
      overdue: !done && daysFromToday(t.dueDate as Date, now) < 0,
    });
  }
  for (const t of followUps) {
    ev.push({ id: `task-followup:${t.id}`, kind: "task-followup", entityId: t.id, date: dateKey(t.followUpDate as Date), title: `Follow up: ${t.title}`, subtitle: t.waitingFor ?? undefined, href: `/tasks/${t.id}`, overdue: daysFromToday(t.followUpDate as Date, now) < 0 });
  }
  for (const i of issues) {
    ev.push({ id: `issue-followup:${i.id}`, kind: "issue-followup", entityId: i.id, date: dateKey(i.nextFollowUpDate as Date), title: `Follow up: ${i.title}`, subtitle: issueCode(i.seq), href: `/issues/${i.id}`, overdue: daysFromToday(i.nextFollowUpDate as Date, now) < 0 });
  }
  for (const f of uat) {
    ev.push({ id: `uat-target:${f.id}`, kind: "uat-target", entityId: f.id, date: dateKey(f.targetDate as Date), title: `UAT target: ${f.name}`, subtitle: f.releaseVersion ?? undefined, href: `/uat/${f.id}`, overdue: daysFromToday(f.targetDate as Date, now) < 0 });
  }
  for (const m of milestones) {
    ev.push({ id: `milestone:${m.id}`, kind: "milestone", entityId: m.id, date: dateKey(m.dueDate as Date), title: m.title, subtitle: m.project.name, href: `/projects/${m.project.id}`, done: Boolean(m.completedAt) });
  }
  for (const p of plan) {
    ev.push({ id: `plan:${p.id}`, kind: "plan", entityId: p.id, date: p.date, title: p.task.title, subtitle: `${taskCode(p.task.seq)} · planned`, href: `/tasks/${p.task.id}`, done: p.status === "Done" });
  }
  return ev.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
