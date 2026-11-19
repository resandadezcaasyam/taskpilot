import type { Prisma } from "@/generated/prisma/client";
import { CLOSED_STATUSES, type QuickFilter } from "./constants";
import { addDays, startOfToday, startOfWeek } from "./dates";

const ACTIVE: Prisma.TaskWhereInput = { status: { notIn: [...CLOSED_STATUSES] } };

/** Single source of truth for dashboard counts AND the filtered task list. */
export function quickFilterWhere(key: QuickFilter, now: Date = new Date()): Prisma.TaskWhereInput {
  const today = startOfToday(now);
  switch (key) {
    case "active":
      return ACTIVE;
    case "due-today":
      return { ...ACTIVE, dueDate: { gte: today, lt: addDays(today, 1) } };
    case "overdue":
      return { ...ACTIVE, dueDate: { lt: today } };
    case "in-progress":
      return { status: "In Progress" };
    case "waiting":
      return { status: "Waiting for Others" };
    case "blocked":
      return { status: "Blocked" };
    case "completed-week":
      return { status: "Done", completedAt: { gte: startOfWeek(now) } };
    case "done":
      return { status: "Done" };
  }
}
