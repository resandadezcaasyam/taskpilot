import { db } from "./db";
import { ACTIVITY_TYPES } from "./constants";
import { addDays, parseDateKey } from "./dates";
import { fetchWindow, literalOnly } from "./like";

export const ACTIVITY_GROUPS = [
  { key: "tasks", label: "Tasks", match: (t: string) => !/^(PROJECT_|UAT_|ISSUE_)/.test(t) },
  { key: "projects", label: "Projects", match: (t: string) => t.startsWith("PROJECT_") },
  { key: "uat", label: "UAT", match: (t: string) => t.startsWith("UAT_") },
  { key: "issues", label: "Issues", match: (t: string) => t.startsWith("ISSUE_") },
] as const;

export interface ActivityFilter { group?: string; q?: string; from?: string; to?: string; take?: number }

export async function queryActivities(f: ActivityFilter = {}) {
  const group = ACTIVITY_GROUPS.find((g) => g.key === f.group);
  const range = f.from || f.to ? { ...(f.from ? { gte: parseDateKey(f.from) } : {}), ...(f.to ? { lt: addDays(parseDateKey(f.to), 1) } : {}) } : undefined;
  const take = Math.min(Math.max(f.take ?? 100, 1), 1000);
  const rows = await db.taskActivity.findMany({
    where: {
      ...(group ? { type: { in: ACTIVITY_TYPES.filter((t) => group.match(t)) as string[] } } : {}),
      ...(f.q?.trim() ? { OR: [{ message: { contains: f.q.trim() } }, { meta: { contains: f.q.trim() } }] } : {}),
      ...(range ? { createdAt: range } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: fetchWindow(f.q ?? "", take + 1),
    include: { task: { select: { id: true, seq: true, title: true } } },
  });
  const kept = literalOnly(rows, f.q ?? "");
  return { items: kept.slice(0, take), hasMore: kept.length > take };
}
