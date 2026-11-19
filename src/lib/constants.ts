export const TASK_STATUSES = [
  "Backlog",
  "To Do",
  "In Progress",
  "Waiting for Others",
  "Blocked",
  "In Review",
  "Done",
  "Cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const CLOSED_STATUSES: readonly TaskStatus[] = ["Done", "Cancelled"];
export const OPEN_STATUSES: TaskStatus[] = TASK_STATUSES.filter(
  (s) => !CLOSED_STATUSES.includes(s),
);

export const TASK_PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_CATEGORIES = [
  "UAT / QA",
  "Feature Development",
  "Bug Investigation",
  "Product Enhancement",
  "Issue Escalation",
  "Operational Support",
  "Stakeholder Follow-up",
  "Documentation",
  "Meeting",
  "Release Monitoring",
  "Project Planning",
  "Personal",
  "Other",
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const PROJECT_STATUSES = ["Planned", "Active", "At Risk", "On Hold", "Completed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PRIORITY_WEIGHT: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

export const ACTIVITY_TYPES = [
  "TASK_CREATED",
  "TASK_UPDATED",
  "STATUS_CHANGED",
  "PRIORITY_CHANGED",
  "DEADLINE_CHANGED",
  "PROGRESS_UPDATED",
  "BLOCKER_ADDED",
  "BLOCKER_RESOLVED",
  "TASK_COMPLETED",
  "TASK_REOPENED",
  "TASK_DELETED",
  "COMMENT_ADDED",
  "SUBTASK_ADDED",
  "PROJECT_CREATED",
  "PROJECT_UPDATED",
  "PROJECT_DELETED",
  "FOLLOW_UP_RECORDED",
  "NEXT_ACTION_COMPLETED",
  "NEXT_ACTION_POSTPONED",
  "NEXT_ACTION_OVERRIDDEN",
  "DEPENDENCY_CHANGED",
  "UAT_CREATED",
  "UAT_UPDATED",
  "UAT_RESULT_UPDATED",
  "UAT_SIGNOFF",
  "ISSUE_CREATED",
  "ISSUE_UPDATED",
  "ISSUE_ESCALATED",
  "ISSUE_STATUS_CHANGED",
  "ISSUE_RESOLVED",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Quick filters shared by the dashboard cards and the task list so counts always match. */
export const QUICK_FILTERS = {
  active: "Active tasks",
  "due-today": "Due today",
  overdue: "Overdue",
  "in-progress": "In progress",
  waiting: "Waiting for others",
  blocked: "Blocked",
  "completed-week": "Completed this week",
  done: "Completed",
} as const;
export type QuickFilter = keyof typeof QUICK_FILTERS;

export const taskCode = (seq: number) => `TP-${String(seq).padStart(4, "0")}`;
