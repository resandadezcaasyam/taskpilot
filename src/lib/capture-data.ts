import { db } from "./db";
import type { KnownData, KnownTask } from "./brain-plan";
import { taskCode } from "./constants";
import { addDays, dateKey, startOfToday } from "./dates";

export const ROUTINE_KEY = "capture.routine";

export async function getRoutine(): Promise<string> {
  return (await db.userPreference.findUnique({ where: { key: ROUTINE_KEY } }))?.value ?? "";
}

/** Titles you create often (or recently), offered as one-tap chips in Brain Dump. */
export async function getRecentTitles(limit = 8): Promise<string[]> {
  const rows = await db.task.findMany({
    where: { createdAt: { gte: addDays(startOfToday(), -90) } },
    select: { title: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  const stats = new Map<string, { title: string; count: number; last: number }>();
  for (const r of rows) {
    const k = r.title.trim().toLowerCase();
    const e = stats.get(k) ?? { title: r.title.trim(), count: 0, last: r.createdAt.getTime() };
    e.count++;
    stats.set(k, e);
  }
  return [...stats.values()].filter((e) => !e.title.startsWith("Copy of ")).sort((a, b) => b.count - a.count || b.last - a.last).slice(0, limit).map((e) => e.title);
}

const taskSelect = {
  id: true, seq: true, title: true, status: true, projectId: true, progress: true, priority: true, dueDate: true, followUpDate: true,
  estimatedMinutes: true, nextAction: true, waitingFor: true, blockerDescription: true, tags: { select: { tag: { select: { name: true } } } },
} as const;
const toKnown = (t: {
  id: string; seq: number; title: string; status: string; projectId: string | null; progress: number; priority: string; dueDate: Date | null; followUpDate: Date | null;
  estimatedMinutes: number | null; nextAction: string | null; waitingFor: string | null; blockerDescription: string | null; tags: { tag: { name: string } }[];
}): KnownTask => ({
  id: t.id, code: taskCode(t.seq), title: t.title, status: t.status, projectId: t.projectId, progress: t.progress, priority: t.priority,
  dueDate: t.dueDate ? dateKey(t.dueDate) : "", followUpDate: t.followUpDate ? dateKey(t.followUpDate) : "",
  estimatedMinutes: t.estimatedMinutes, nextAction: (t.nextAction ?? "").trim(), waitingFor: (t.waitingFor ?? "").trim(), blocker: (t.blockerDescription ?? "").trim(),
  tags: t.tags.map((x) => x.tag.name),
});

/** Everything Brain Dump needs to match typed text against what already exists (all read locally). */
export async function getBrainDumpKnown(): Promise<KnownData> {
  const [projects, open, recentlyDone, tags, taskPeople, issuePeople, uatPeople, projectPeople] = await Promise.all([
    db.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.task.findMany({ where: { status: { notIn: ["Done", "Cancelled"] } }, select: taskSelect, orderBy: { updatedAt: "desc" }, take: 1500 }),
    db.task.findMany({ where: { status: "Done", completedAt: { gte: addDays(startOfToday(), -14) } }, select: taskSelect, orderBy: { completedAt: "desc" }, take: 300 }),
    db.tag.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
    db.task.findMany({ select: { assignee: true, stakeholder: true, waitingFor: true }, orderBy: { updatedAt: "desc" }, take: 2000 }),
    db.issue.findMany({ select: { reportedBy: true, responsiblePic: true }, take: 1000 }),
    db.uatFeature.findMany({ select: { owner: true }, take: 300 }),
    db.project.findMany({ select: { owner: true }, take: 300 }),
  ]);
  // people: the spelling used most often wins, so "Andi" beats a one-off "andi"
  const counts = new Map<string, Map<string, number>>();
  const add = (name: string | null) => {
    const n = name?.trim();
    if (!n || n.length > 60) return;
    const key = n.toLowerCase().replace(/\s+/g, " ");
    const spellings = counts.get(key) ?? new Map<string, number>();
    spellings.set(n, (spellings.get(n) ?? 0) + 1);
    counts.set(key, spellings);
  };
  for (const t of taskPeople) [t.assignee, t.stakeholder, t.waitingFor].forEach(add);
  for (const i of issuePeople) [i.reportedBy, i.responsiblePic].forEach(add);
  for (const u of uatPeople) add(u.owner);
  for (const p of projectPeople) add(p.owner);
  const people = [...counts.values()]
    .map((sp) => ({ name: [...sp.entries()].sort((a, b) => b[1] - a[1])[0][0], total: [...sp.values()].reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 300)
    .map((p) => p.name);
  return { projects, tasks: [...open, ...recentlyDone].map(toKnown), people, tags: tags.map((t) => t.name) };
}
