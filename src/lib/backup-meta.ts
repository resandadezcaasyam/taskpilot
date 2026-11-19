/**
 * Backup / restore rules (pure). The table list below is checked against prisma/schema.prisma by a test,
 * so adding a model or a DateTime field without updating this file fails the test suite.
 */
export const BACKUP_FORMAT = "taskpilot-backup";
export const BACKUP_SCHEMA_VERSION = 1;

type Ref = { field: string; table: string; onMissing: "skip" | "null" };
export interface TableMeta {
  name: string; // Prisma model name
  delegate: string; // Prisma client property
  dates: string[]; // DateTime columns
  pk?: string[]; // composite primary key (default: id)
  refs: Ref[];
  files?: boolean; // rows that point to a file under uploads/
}
const req = (field: string, table: string): Ref => ({ field, table, onMissing: "skip" });
const opt = (field: string, table: string): Ref => ({ field, table, onMissing: "null" });

/** Parents come before children. */
export const BACKUP_TABLES: TableMeta[] = [
  { name: "LocalProfile", delegate: "localProfile", dates: ["createdAt", "updatedAt"], refs: [] },
  { name: "UserPreference", delegate: "userPreference", dates: ["createdAt", "updatedAt"], refs: [] },
  { name: "Project", delegate: "project", dates: ["startDate", "targetDate", "createdAt", "updatedAt"], refs: [] },
  { name: "Tag", delegate: "tag", dates: ["createdAt"], refs: [] },
  { name: "ProjectMilestone", delegate: "projectMilestone", dates: ["dueDate", "completedAt", "createdAt", "updatedAt"], refs: [req("projectId", "Project")] },
  { name: "Issue", delegate: "issue", dates: ["reportedDate", "expectedResolution", "actualResolution", "nextFollowUpDate", "createdAt", "updatedAt"], refs: [opt("projectId", "Project")] },
  { name: "UatFeature", delegate: "uatFeature", dates: ["startDate", "targetDate", "fixDeployedAt", "createdAt", "updatedAt"], refs: [opt("projectId", "Project")] },
  { name: "Task", delegate: "task", dates: ["startDate", "dueDate", "nextActionDue", "blockedAt", "followUpDate", "createdAt", "updatedAt", "completedAt"], refs: [opt("projectId", "Project")] },
  { name: "Subtask", delegate: "subtask", dates: ["completedAt", "createdAt", "updatedAt"], refs: [req("taskId", "Task")] },
  { name: "TaskDependency", delegate: "taskDependency", dates: ["createdAt"], refs: [req("taskId", "Task"), req("dependsOnTaskId", "Task")] },
  { name: "NextAction", delegate: "nextAction", dates: ["postponedTo", "completedAt", "createdAt", "updatedAt"], refs: [req("taskId", "Task")] },
  { name: "TaskActivity", delegate: "taskActivity", dates: ["createdAt"], refs: [opt("taskId", "Task")] },
  { name: "TaskComment", delegate: "taskComment", dates: ["createdAt", "updatedAt"], refs: [req("taskId", "Task")] },
  { name: "TaskTag", delegate: "taskTag", dates: [], pk: ["taskId", "tagId"], refs: [req("taskId", "Task"), req("tagId", "Tag")] },
  { name: "TaskAttachment", delegate: "taskAttachment", dates: ["createdAt"], refs: [req("taskId", "Task")], files: true },
  { name: "UatTestCase", delegate: "uatTestCase", dates: ["createdAt", "updatedAt"], refs: [req("featureId", "UatFeature"), opt("linkedIssueId", "Issue")] },
  { name: "UatEvidence", delegate: "uatEvidence", dates: ["createdAt"], refs: [req("testCaseId", "UatTestCase")], files: true },
  { name: "IssueUpdate", delegate: "issueUpdate", dates: ["createdAt"], refs: [req("issueId", "Issue")], files: true },
  { name: "Reminder", delegate: "reminder", dates: ["dueAt", "snoozedUntil", "dismissedAt", "createdAt", "updatedAt"], refs: [req("taskId", "Task"), req("issueId", "Issue"), req("uatFeatureId", "UatFeature")] },
  { name: "PlanItem", delegate: "planItem", dates: ["doneAt", "createdAt", "updatedAt"], refs: [req("taskId", "Task")] },
  { name: "DailyNote", delegate: "dailyNote", dates: ["createdAt", "updatedAt"], refs: [] },
];
export const TABLE_BY_NAME = new Map(BACKUP_TABLES.map((t) => [t.name, t]));

export type Row = Record<string, unknown>;
export interface BackupFile {
  format: string;
  schemaVersion: number;
  appVersion?: string;
  exportedAt?: string;
  counts?: Record<string, number>;
  files?: { path: string; included: boolean }[];
  data: Record<string, Row[]>;
}

export const rowKey = (t: TableMeta, r: Row) => (t.pk ? t.pk.map((f) => String(r[f])).join(":") : String(r.id));

/** Structural validation of a parsed backup. Returns a readable error, or null when it looks usable. */
export function validateBackup(obj: unknown): { error: string | null; warnings: string[] } {
  const warnings: string[] = [];
  if (!obj || typeof obj !== "object") return { error: "This is not a TaskPilot backup (the file is not a JSON object).", warnings };
  const b = obj as Partial<BackupFile>;
  if (b.format !== BACKUP_FORMAT) return { error: "This is not a TaskPilot backup (missing format marker).", warnings };
  if (typeof b.schemaVersion !== "number") return { error: "The backup has no schema version, so it cannot be checked safely.", warnings };
  if (b.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return { error: `This backup was made by a newer TaskPilot (backup version ${b.schemaVersion}, this app understands ${BACKUP_SCHEMA_VERSION}). Update TaskPilot first.`, warnings };
  }
  if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) return { error: "The backup has no data section.", warnings };
  for (const [name, rows] of Object.entries(b.data)) {
    const meta = TABLE_BY_NAME.get(name);
    if (!meta) {
      warnings.push(`Unknown table "${name}" in the backup will be ignored.`);
      continue;
    }
    if (!Array.isArray(rows)) return { error: `Table ${name} is not a list of records.`, warnings };
    for (const [i, r] of rows.entries()) {
      if (!r || typeof r !== "object" || Array.isArray(r)) return { error: `${name} record ${i + 1} is not an object.`, warnings };
      const needs = meta.pk ?? ["id"];
      for (const f of needs) if (typeof (r as Row)[f] !== "string" || !(r as Row)[f]) return { error: `${name} record ${i + 1} is missing its "${f}".`, warnings };
    }
  }
  return { error: null, warnings };
}

/** Converts ISO strings in the table's DateTime columns back to Date. Throws on an invalid date. */
export function reviveRow(t: TableMeta, r: Row): Row {
  const out: Row = { ...r };
  for (const f of t.dates) {
    const v = out[f];
    if (v === null || v === undefined) {
      out[f] = v === undefined ? null : null;
      continue;
    }
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) throw new Error(`${t.name}.${f} has an invalid date: ${String(v)}`);
    out[f] = d;
  }
  return out;
}

export const normRow = (r: Row): string =>
  JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k] instanceof Date ? (r[k] as Date).toISOString() : (r[k] ?? null)]));

// ---------------------------------------------------------------- restore planning

export type RestoreMode = "merge" | "replace";
export interface ExistingIndex {
  /** table -> (row key -> normalised row) */
  rows: Record<string, Map<string, string>>;
  taskSeq: Map<number, string>;
  issueSeq: Map<number, string>;
  maxTaskSeq: number;
  maxIssueSeq: number;
  tagByName: Map<string, string>;
  prefKeys: Set<string>;
  noteDates: Set<string>;
  planKeys: Set<string>;
  depKeys: Set<string>;
  reminderKeys: Set<string>;
}
export const emptyIndex = (): ExistingIndex => ({
  rows: {}, taskSeq: new Map(), issueSeq: new Map(), maxTaskSeq: 0, maxIssueSeq: 0, tagByName: new Map(),
  prefKeys: new Set(), noteDates: new Set(), planKeys: new Set(), depKeys: new Set(), reminderKeys: new Set(),
});

export interface TablePlan {
  table: string;
  inBackup: number;
  insert: Row[];
  identical: number;
  differs: number; // exists with different content, existing copy is kept in merge mode
  skipped: Record<string, number>;
}
export interface RestorePlan {
  mode: RestoreMode;
  tables: TablePlan[];
  renumbered: { tasks: number; issues: number };
  warnings: string[];
  tagRemap: Map<string, string>;
}

/**
 * Decides, without touching the database, which backup rows would be inserted.
 * merge: only records that are missing are added; nothing existing is changed or overwritten.
 * replace: the caller wipes the tables first, so pass an empty index.
 */
export function planRestore(backup: BackupFile, existing: ExistingIndex, mode: RestoreMode): RestorePlan {
  const plan: RestorePlan = { mode, tables: [], renumbered: { tasks: 0, issues: 0 }, warnings: [], tagRemap: new Map() };
  const known: Record<string, Set<string>> = {};
  for (const t of BACKUP_TABLES) known[t.name] = new Set(existing.rows[t.name]?.keys() ?? []);
  let nextTaskSeq = existing.maxTaskSeq;
  let nextIssueSeq = existing.maxIssueSeq;
  const usedTaskSeq = new Set(existing.taskSeq.keys());
  const usedIssueSeq = new Set(existing.issueSeq.keys());
  const bump = (tp: TablePlan, reason: string) => (tp.skipped[reason] = (tp.skipped[reason] ?? 0) + 1);
  const backupMax = (rows: Row[]) => Math.max(0, ...rows.map((r) => Number(r.seq) || 0));
  nextTaskSeq = Math.max(nextTaskSeq, backupMax(backup.data.Task ?? []));
  nextIssueSeq = Math.max(nextIssueSeq, backupMax(backup.data.Issue ?? []));

  for (const meta of BACKUP_TABLES) {
    const rows = backup.data[meta.name] ?? [];
    const tp: TablePlan = { table: meta.name, inBackup: rows.length, insert: [], identical: 0, differs: 0, skipped: {} };
    const seenInFile = new Set<string>();
    for (const raw of rows) {
      let row = reviveRow(meta, raw);
      const key = rowKey(meta, row);
      if (seenInFile.has(key)) {
        bump(tp, "duplicate record in the backup");
        continue;
      }
      seenInFile.add(key);

      const have = existing.rows[meta.name]?.get(key);
      if (have !== undefined) {
        if (have === normRow(row)) tp.identical++;
        else {
          tp.differs++;
        }
        continue;
      }

      // foreign keys must resolve to something that exists (or is about to be inserted)
      let orphan = false;
      for (const ref of meta.refs) {
        const v = row[ref.field];
        if (v === null || v === undefined) continue;
        let target = String(v);
        if (ref.table === "Tag" && plan.tagRemap.has(target)) {
          target = plan.tagRemap.get(target) as string;
          row = { ...row, [ref.field]: target };
        }
        if (!known[ref.table].has(target)) {
          if (ref.onMissing === "null") {
            row = { ...row, [ref.field]: null };
            plan.warnings.push(`${meta.name} ${key}: the linked ${ref.table.toLowerCase()} is not available, so the link was cleared.`);
          } else orphan = true;
        }
      }
      if (orphan) {
        bump(tp, "its parent record is missing");
        continue;
      }

      // unique constraints beyond the id
      if (meta.name === "Task" || meta.name === "Issue") {
        const used = meta.name === "Task" ? usedTaskSeq : usedIssueSeq;
        const seq = Number(row.seq);
        if (used.has(seq)) {
          const next = meta.name === "Task" ? ++nextTaskSeq : ++nextIssueSeq;
          row = { ...row, seq: next };
          used.add(next);
          plan.renumbered[meta.name === "Task" ? "tasks" : "issues"]++;
        } else used.add(seq);
      }
      if (meta.name === "Tag") {
        const name = String(row.name);
        const existingId = existing.tagByName.get(name);
        if (existingId) {
          plan.tagRemap.set(key, existingId);
          bump(tp, "a tag with this name already exists (merged)");
          continue;
        }
        existing.tagByName.set(name, key);
      }
      if (meta.name === "UserPreference") {
        if (existing.prefKeys.has(String(row.key))) {
          bump(tp, "setting already exists (yours is kept)");
          continue;
        }
        existing.prefKeys.add(String(row.key));
      }
      if (meta.name === "DailyNote") {
        if (existing.noteDates.has(String(row.date))) {
          bump(tp, "a note for that day already exists");
          continue;
        }
        existing.noteDates.add(String(row.date));
      }
      if (meta.name === "PlanItem") {
        const k = `${row.date}:${row.taskId}`;
        if (existing.planKeys.has(k)) {
          bump(tp, "already planned for that day");
          continue;
        }
        existing.planKeys.add(k);
      }
      if (meta.name === "TaskDependency") {
        const k = `${row.taskId}:${row.dependsOnTaskId}`;
        if (existing.depKeys.has(k)) {
          bump(tp, "dependency already exists");
          continue;
        }
        existing.depKeys.add(k);
      }
      if (meta.name === "TaskTag") {
        // TaskTag has no id; its key is taskId:tagId. After a tag remap two rows can collapse into one.
        if (known.TaskTag.has(rowKey(meta, row))) {
          bump(tp, "tag already on this task");
          continue;
        }
      }
      if (meta.name === "Reminder") {
        const owner = `${row.taskId ?? ""}|${row.issueId ?? ""}|${row.uatFeatureId ?? ""}|${row.type}`;
        if (existing.reminderKeys.has(owner)) {
          bump(tp, "reminder already exists");
          continue;
        }
        existing.reminderKeys.add(owner);
      }

      known[meta.name].add(rowKey(meta, row));
      tp.insert.push(row);
    }
    plan.tables.push(tp);
  }
  return plan;
}
