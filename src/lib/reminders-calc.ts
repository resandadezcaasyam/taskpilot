import { daysFromToday, daysSince, formatDate } from "./dates";
import { isOpenStatus } from "./engine";
import type { EngineSettings } from "./settings";

export const REMINDER_TYPES = [
  "OVERDUE",
  "DEADLINE_APPROACHING",
  "FOLLOW_UP_DUE",
  "UNRESOLVED_BLOCKER",
  "INACTIVE_TASK",
  "UAT_TARGET",
] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export const REMINDER_LABELS: Record<ReminderType, string> = {
  OVERDUE: "Overdue",
  DEADLINE_APPROACHING: "Deadline approaching",
  FOLLOW_UP_DUE: "Follow-up due",
  UNRESOLVED_BLOCKER: "Unresolved blocker",
  INACTIVE_TASK: "Inactive task",
  UAT_TARGET: "UAT target",
};

export interface ReminderTask {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  followUpDate: Date | null;
  updatedAt: Date;
  blockedAt: Date | null;
}

export interface ComputedReminder {
  taskId: string;
  type: ReminderType;
  message: string;
  dueAt: Date;
}

/** Which reminders should exist right now. Re-evaluated on startup, on page loads and every minute while open. */
export function computeReminders(tasks: ReminderTask[], s: EngineSettings, now: Date): ComputedReminder[] {
  const out: ComputedReminder[] = [];
  for (const t of tasks) {
    if (!isOpenStatus(t.status)) continue;
    const q = `"${t.title}"`;
    if (t.dueDate) {
      const d = daysFromToday(t.dueDate, now);
      if (d < 0) {
        out.push({ taskId: t.id, type: "OVERDUE", dueAt: t.dueDate, message: `${q} is overdue by ${-d} ${-d === 1 ? "day" : "days"}` });
      } else if (d <= s.deadlineLeadDays) {
        const when = d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
        out.push({ taskId: t.id, type: "DEADLINE_APPROACHING", dueAt: t.dueDate, message: `${q} is due ${when}` });
      }
    }
    if (t.followUpDate && daysFromToday(t.followUpDate, now) <= 0) {
      out.push({ taskId: t.id, type: "FOLLOW_UP_DUE", dueAt: t.followUpDate, message: `Follow up on ${q} (planned for ${formatDate(t.followUpDate)})` });
    }
    if (t.status === "Blocked" && t.blockedAt) {
      const days = daysSince(t.blockedAt, now);
      if (days >= s.blockerReminderDays) {
        out.push({ taskId: t.id, type: "UNRESOLVED_BLOCKER", dueAt: t.blockedAt, message: `${q} has been blocked for ${days} days` });
      }
    }
    const watchesInactivity = t.status === "To Do" || t.status === "In Progress" || t.status === "In Review";
    if (watchesInactivity) {
      const idle = daysSince(t.updatedAt, now);
      if (idle >= s.inactivityDays) {
        out.push({ taskId: t.id, type: "INACTIVE_TASK", dueAt: t.updatedAt, message: `No updates on ${q} for ${idle} days` });
      }
    }
  }
  return out;
}

const SEVERITY: Record<ReminderType, number> = {
  OVERDUE: 0,
  FOLLOW_UP_DUE: 1,
  UNRESOLVED_BLOCKER: 2,
  DEADLINE_APPROACHING: 3,
  INACTIVE_TASK: 4,
  UAT_TARGET: 3,
};
export const reminderSeverity = (t: string) => SEVERITY[t as ReminderType] ?? 9;

export interface ComputedEntityReminder {
  entityId: string;
  type: ReminderType;
  message: string;
  dueAt: Date;
}

export function computeUatReminders(
  features: { id: string; name: string; status: string; signOffStatus: string; targetDate: Date | null }[],
  s: EngineSettings,
  now: Date,
): ComputedEntityReminder[] {
  const out: ComputedEntityReminder[] = [];
  for (const f of features) {
    if (f.status === "Completed" || f.signOffStatus === "Signed Off" || !f.targetDate) continue;
    const d = daysFromToday(f.targetDate, now);
    if (d < 0) {
      out.push({ entityId: f.id, type: "UAT_TARGET", dueAt: f.targetDate, message: `UAT "${f.name}" passed its target date ${-d} ${-d === 1 ? "day" : "days"} ago` });
    } else if (d <= s.uatLeadDays) {
      const when = d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
      out.push({ entityId: f.id, type: "UAT_TARGET", dueAt: f.targetDate, message: `UAT "${f.name}" target date is ${when}` });
    }
  }
  return out;
}

export function computeIssueReminders(
  issues: { id: string; code: string; title: string; status: string; nextFollowUpDate: Date | null; expectedResolution: Date | null }[],
  now: Date,
): ComputedEntityReminder[] {
  const out: ComputedEntityReminder[] = [];
  for (const i of issues) {
    if (i.status === "Resolved" || i.status === "Closed") continue;
    if (i.nextFollowUpDate && daysFromToday(i.nextFollowUpDate, now) <= 0) {
      out.push({ entityId: i.id, type: "FOLLOW_UP_DUE", dueAt: i.nextFollowUpDate, message: `Follow up on issue ${i.code} "${i.title}" (planned for ${formatDate(i.nextFollowUpDate)})` });
    }
    if (i.expectedResolution) {
      const d = daysFromToday(i.expectedResolution, now);
      if (d < 0) {
        out.push({ entityId: i.id, type: "OVERDUE", dueAt: i.expectedResolution, message: `Issue ${i.code} "${i.title}" is ${-d} ${-d === 1 ? "day" : "days"} past its expected resolution` });
      }
    }
  }
  return out;
}
