/**
 * Brain Dump planning (pure): decides, for every pasted line, whether to CREATE a new task, UPDATE an existing
 * one that clearly is the same task (typos and filler words allowed), or SKIP it because it already exists.
 * Nothing here touches the database; the page shows the plan and the user can change any row before saving.
 */
import { parseBrainDump, type BrainDumpContext, type ParsedLine } from "./bulk-parse";
import { titleSimilarity, tokens } from "./fuzzy";
import type { TaskFormValues } from "./validators";

export interface KnownTask {
  id: string;
  code: string;
  title: string;
  status: string;
  projectId: string | null;
  progress: number;
  priority: string;
  dueDate: string; // yyyy-MM-dd or ""
  followUpDate: string;
  estimatedMinutes: number | null;
  nextAction: string;
  waitingFor: string;
  blocker: string;
  tags: string[];
}
export interface KnownData {
  projects: { id: string; name: string }[];
  tasks: KnownTask[];
  people: string[];
  tags: string[];
}

export interface TaskMatch { task: KnownTask; score: number; strong: boolean }
export interface MatchIndex { entries: { task: KnownTask; tokens: string[] }[]; byKey: Map<string, number[]> }

/** Titles at least this similar are treated as the same task; "similar" ones are only pointed out. */
export const STRONG_MATCH = 0.85;
export const SIMILAR_MATCH = 0.6;

const keysOf = (token: string) => (token.length <= 3 ? [token] : [`^${token.slice(0, 3)}`, `$${token.slice(-3)}`]);

export function buildIndex(tasks: KnownTask[]): MatchIndex {
  const entries = tasks.map((task) => ({ task, tokens: tokens(task.title) }));
  const byKey = new Map<string, number[]>();
  entries.forEach((e, i) => {
    for (const t of new Set(e.tokens)) for (const k of keysOf(t)) byKey.set(k, [...(byKey.get(k) ?? []), i]);
  });
  return { entries, byKey };
}

/** Existing tasks whose title is the same as, or close to, `title`. Best first, at most three. */
export function matchTasks(title: string, index: MatchIndex, projectId?: string): TaskMatch[] {
  const q = tokens(title);
  if (!q.length) return [];
  const candidates = new Set<number>();
  for (const t of q) for (const k of keysOf(t)) for (const i of index.byKey.get(k) ?? []) candidates.add(i);
  const out: (TaskMatch & { i: number })[] = [];
  for (const i of [...candidates].sort((a, b) => a - b).slice(0, 400)) {
    const { task } = index.entries[i];
    const s = titleSimilarity(title, task.title);
    const similar = s.dice >= SIMILAR_MATCH || (s.containment === 1 && Math.min(s.a, s.b) >= 2 && s.matched >= 2);
    if (!similar) continue;
    let score = Math.max(s.dice, s.dice >= SIMILAR_MATCH ? 0 : SIMILAR_MATCH);
    if (projectId && task.projectId === projectId) score = Math.min(1, score + 0.04);
    out.push({ task, score, strong: s.dice >= STRONG_MATCH, i });
  }
  return out.sort((a, b) => b.score - a.score || a.i - b.i).slice(0, 3).map(({ i, ...m }) => (void i, m));
}

// ---------------------------------------------------------------- updating an existing task

export interface UpdatePatch {
  status?: string;
  progress?: string;
  priority?: string;
  dueDate?: string;
  followUpDate?: string;
  estimatedHours?: string;
  nextAction?: string;
  blockerDescription?: string;
  waitingFor?: string;
  projectId?: string;
  tags?: string;
}

/** What the line would change on `target`: only things the line stated, and only if they differ. */
export function buildUpdate(values: TaskFormValues, explicit: ReadonlySet<string>, target: KnownTask): { patch: UpdatePatch; summary: string[]; problem?: string } {
  const patch: UpdatePatch = {};
  const summary: string[] = [];
  const set = <K extends keyof UpdatePatch>(key: K, value: string, label: string) => {
    patch[key] = value;
    summary.push(label);
  };
  if (explicit.has("status") && values.status !== target.status) set("status", values.status, `Status → ${values.status}`);
  if (explicit.has("progress") && values.status !== "Done" && Number(values.progress) !== target.progress) set("progress", values.progress, `Progress → ${values.progress}%`);
  if (explicit.has("priority") && values.priority !== target.priority) set("priority", values.priority, `Priority → ${values.priority}`);
  if (explicit.has("dueDate") && values.dueDate && values.dueDate !== target.dueDate) set("dueDate", values.dueDate, `Due → ${values.dueDate}`);
  if (explicit.has("followUpDate") && values.followUpDate && values.followUpDate !== target.followUpDate) set("followUpDate", values.followUpDate, `Follow-up → ${values.followUpDate}`);
  if (explicit.has("estimatedHours") && values.estimatedHours && Math.round(Number(values.estimatedHours) * 60) !== target.estimatedMinutes) set("estimatedHours", values.estimatedHours, `Estimate → ${values.estimatedHours}h`);
  if (explicit.has("nextAction") && values.nextAction && values.nextAction.trim() !== target.nextAction) set("nextAction", values.nextAction, `Next step → ${values.nextAction}`);
  if (explicit.has("blockerDescription") && values.blockerDescription && values.blockerDescription.trim() !== target.blocker) set("blockerDescription", values.blockerDescription, `Blocker → ${values.blockerDescription}`);
  if (explicit.has("waitingFor") && values.waitingFor && values.waitingFor.trim().toLowerCase() !== target.waitingFor.toLowerCase()) set("waitingFor", values.waitingFor, `Waiting for → ${values.waitingFor}`);
  if (explicit.has("projectId") && values.projectId && values.projectId !== target.projectId) set("projectId", values.projectId, "Project changed");
  if (explicit.has("tags") && values.tags) {
    const have = new Set(target.tags.map((t) => t.toLowerCase()));
    const missing = values.tags.split(",").map((t) => t.trim()).filter((t) => t && !have.has(t.toLowerCase()));
    if (missing.length) set("tags", missing.join(", "), `Tags added: ${missing.join(", ")}`);
  }
  const problem = patch.status === "Blocked" && !patch.blockerDescription ? "Blocked tasks need a reason. Add it after => or type it below." : undefined;
  return { patch, summary, problem };
}

// ---------------------------------------------------------------- the plan

export type PlannedAction = { kind: "create" } | { kind: "update"; taskId: string } | { kind: "skip"; reason: string };
export interface PlannedRow extends ParsedLine { matches: TaskMatch[]; action: PlannedAction }

export function planBrainDump(
  text: string,
  known: KnownData,
  defaults: BrainDumpContext["defaults"],
  now: Date = new Date(),
  index: MatchIndex = buildIndex(known.tasks),
): { rows: PlannedRow[]; truncated: number } {
  const parsed = parseBrainDump(text, { projects: known.projects, people: known.people, tags: known.tags, createMissingProjects: true, defaults }, now);
  const rows = parsed.items.map((p): PlannedRow => {
    const matches = matchTasks(p.values.title, index, p.values.projectId.startsWith("new:") ? undefined : p.values.projectId);
    const best = matches[0];
    let action: PlannedAction = { kind: "create" };
    if (best?.strong) {
      const u = buildUpdate(p.values, new Set(p.explicit), best.task);
      action = Object.keys(u.patch).length > 0
        ? { kind: "update", taskId: best.task.id }
        : { kind: "skip", reason: best.task.status === "Done" ? `Already done as ${best.task.code}` : `Already exists as ${best.task.code}` };
    }
    return { ...p, matches, action };
  });
  return { rows, truncated: parsed.truncated };
}
