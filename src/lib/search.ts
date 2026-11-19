import { db } from "./db";
import { taskCode } from "./constants";
import { issueCode } from "./issues";
import { fetchWindow, literalOnly } from "./like";
import { makeSnippet } from "./search-util";

export type SearchGroup = "tasks" | "projects" | "uat" | "issues" | "notes" | "people" | "tags";
export interface SearchItem {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  snippet?: { before: string; match: string; after: string } | null;
}
export type SearchResults = Record<SearchGroup, { items: SearchItem[]; more: boolean }>;

const LIMIT = 15;
export const SEARCH_GROUPS: { key: SearchGroup; label: string }[] = [
  { key: "tasks", label: "Tasks" }, { key: "projects", label: "Projects" }, { key: "uat", label: "UAT" }, { key: "issues", label: "Issues" },
  { key: "notes", label: "Notes and comments" }, { key: "people", label: "Stakeholders" }, { key: "tags", label: "Tags" },
];

const has = (fields: string[], q: string) => ({ OR: fields.map((f) => ({ [f]: { contains: q } })) });
const pack = (items: SearchItem[]) => ({ items: items.slice(0, LIMIT), more: items.length > LIMIT });
const firstMatch = (q: string, ...texts: (string | null | undefined)[]) => {
  for (const t of texts) {
    const s = makeSnippet(t, q);
    if (s) return s;
  }
  return null;
};

export async function globalSearch(raw: string): Promise<SearchResults> {
  const q = raw.trim();
  const take = fetchWindow(q, LIMIT + 1);
  const L = <T,>(rows: T[]) => literalOnly(rows, q);
  const raw_ = await Promise.all([
    db.task.findMany({ where: has(["title", "description", "nextAction", "blockerDescription", "waitingFor", "assignee", "stakeholder"], q), include: { project: { select: { name: true } } }, take, orderBy: { updatedAt: "desc" } }),
    db.project.findMany({ where: has(["name", "description", "owner", "category"], q), take, orderBy: { updatedAt: "desc" } }),
    db.uatFeature.findMany({ where: has(["name", "releaseVersion", "environment", "owner", "remarks"], q), take, orderBy: { updatedAt: "desc" } }),
    db.uatTestCase.findMany({ where: has(["title", "steps", "expectedResult", "actualResult", "prerequisites"], q), include: { feature: { select: { id: true, name: true } } }, take, orderBy: { updatedAt: "desc" } }),
    db.issue.findMany({ where: has(["title", "description", "rootCause", "impact", "workaround", "latestUpdate"], q), take, orderBy: { updatedAt: "desc" } }),
    db.task.findMany({ where: { notes: { contains: q } }, select: { id: true, seq: true, title: true, notes: true }, take }),
    db.taskComment.findMany({ where: { body: { contains: q } }, include: { task: { select: { id: true, seq: true, title: true } } }, take, orderBy: { createdAt: "desc" } }),
    db.dailyNote.findMany({ where: { note: { contains: q } }, take, orderBy: { date: "desc" } }),
    db.project.findMany({ where: has(["notes", "risks"], q), select: { id: true, name: true, notes: true, risks: true }, take }),
    db.issueUpdate.findMany({ where: { message: { contains: q } }, include: { issue: { select: { id: true, seq: true, title: true } } }, take, orderBy: { createdAt: "desc" } }),
    db.tag.findMany({ where: { name: { contains: q.replace(/^#/, "") } }, include: { _count: { select: { tasks: true } } }, take, orderBy: { name: "asc" } }),
    db.task.findMany({ where: has(["stakeholder", "assignee", "waitingFor"], q), select: { stakeholder: true, assignee: true, waitingFor: true }, take: 300 }),
    db.issue.findMany({ where: has(["reportedBy", "responsiblePic"], q), select: { reportedBy: true, responsiblePic: true }, take: 300 }),
    db.uatFeature.findMany({ where: { owner: { contains: q } }, select: { owner: true }, take: 100 }),
    db.project.findMany({ where: { owner: { contains: q } }, select: { owner: true }, take: 100 }),
  ]);
  const [tasks, projects, features, cases, issues, taskNotes, comments, dailyNotes, projectNotes, issueUpdates, tags, tp, ip, up, pp] = [
    L(raw_[0]), L(raw_[1]), L(raw_[2]), L(raw_[3]), L(raw_[4]), L(raw_[5]), L(raw_[6]), L(raw_[7]), L(raw_[8]), L(raw_[9]), L(raw_[10]), L(raw_[11]), L(raw_[12]), L(raw_[13]), L(raw_[14]),
  ] as typeof raw_;

  const lower = q.toLowerCase();
  const people = new Map<string, { name: string; tasks: number; issues: number; uat: number; projects: number }>();
  const touch = (name: string | null, kind: "tasks" | "issues" | "uat" | "projects") => {
    if (!name || !name.toLowerCase().includes(lower)) return;
    const e = people.get(name.toLowerCase()) ?? { name, tasks: 0, issues: 0, uat: 0, projects: 0 };
    e[kind]++;
    people.set(name.toLowerCase(), e);
  };
  for (const t of tp) { touch(t.stakeholder, "tasks"); touch(t.assignee, "tasks"); touch(t.waitingFor, "tasks"); }
  for (const i of ip) { touch(i.reportedBy, "issues"); touch(i.responsiblePic, "issues"); }
  for (const u of up) touch(u.owner, "uat");
  for (const p of pp) touch(p.owner, "projects");

  const notes: SearchItem[] = [
    ...taskNotes.map((t) => ({ id: `tn-${t.id}`, title: t.title, subtitle: `${taskCode(t.seq)} · task notes`, href: `/tasks/${t.id}`, snippet: makeSnippet(t.notes, q) })),
    ...comments.map((c) => ({ id: `tc-${c.id}`, title: c.task.title, subtitle: `${taskCode(c.task.seq)} · comment`, href: `/tasks/${c.task.id}`, snippet: makeSnippet(c.body, q) })),
    ...issueUpdates.map((u) => ({ id: `iu-${u.id}`, title: u.issue.title, subtitle: `${issueCode(u.issue.seq)} · ${u.kind.toLowerCase()}`, href: `/issues/${u.issue.id}`, snippet: makeSnippet(u.message, q) })),
    ...projectNotes.map((p) => ({ id: `pn-${p.id}`, title: p.name, subtitle: "project notes or risks", href: `/projects/${p.id}`, snippet: firstMatch(q, p.notes, p.risks) })),
    ...dailyNotes.map((n) => ({ id: `dn-${n.id}`, title: `Daily note, ${n.date}`, subtitle: "planner notes", href: "/today", snippet: makeSnippet(n.note, q) })),
  ];

  return {
    tasks: pack(tasks.map((t) => ({ id: t.id, title: t.title, subtitle: `${taskCode(t.seq)} · ${t.status}${t.project ? ` · ${t.project.name}` : ""}`, href: `/tasks/${t.id}`, snippet: firstMatch(q, t.description, t.nextAction, t.blockerDescription) }))),
    projects: pack(projects.map((p) => ({ id: p.id, title: p.name, subtitle: `${p.status}${p.owner ? ` · ${p.owner}` : ""}`, href: `/projects/${p.id}`, snippet: makeSnippet(p.description, q) }))),
    uat: pack([
      ...features.map((f) => ({ id: f.id, title: f.name, subtitle: `UAT feature · ${f.status}`, href: `/uat/${f.id}`, snippet: makeSnippet(f.remarks, q) })),
      ...cases.map((c) => ({ id: c.id, title: c.title, subtitle: `Test case · ${c.feature.name} · ${c.result}`, href: `/uat/${c.feature.id}`, snippet: firstMatch(q, c.steps, c.expectedResult, c.actualResult, c.prerequisites) })),
    ]),
    issues: pack(issues.map((i) => ({ id: i.id, title: i.title, subtitle: `${issueCode(i.seq)} · ${i.status} · ${i.severity}`, href: `/issues/${i.id}`, snippet: firstMatch(q, i.description, i.rootCause, i.impact, i.latestUpdate) }))),
    notes: pack(notes),
    people: pack([...people.values()].sort((a, b) => b.tasks + b.issues - (a.tasks + a.issues)).map((p) => ({
      id: p.name, title: p.name,
      subtitle: [p.tasks && `${p.tasks} ${p.tasks === 1 ? "task" : "tasks"}`, p.issues && `${p.issues} ${p.issues === 1 ? "issue" : "issues"}`, p.uat && `${p.uat} UAT`, p.projects && `${p.projects} ${p.projects === 1 ? "project" : "projects"}`].filter(Boolean).join(" · "),
      href: `/tasks?q=${encodeURIComponent(p.name)}`,
    }))),
    tags: pack(tags.map((t) => ({ id: t.id, title: `#${t.name}`, subtitle: `${t._count.tasks} ${t._count.tasks === 1 ? "task" : "tasks"}`, href: `/tasks?q=${encodeURIComponent(t.name)}` }))),
  };
}
