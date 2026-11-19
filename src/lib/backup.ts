import fs from "node:fs/promises";
import path from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { APP_VERSION } from "./app-info";
import {
  BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, BACKUP_TABLES, emptyIndex, normRow, planRestore, reviveRow, rowKey, validateBackup,
  type BackupFile, type ExistingIndex, type RestoreMode, type RestorePlan, type Row,
} from "./backup-meta";
import { dateKey } from "./dates";
import { db } from "./db";
import { getSettings } from "./engine-data";
import { resolveStored } from "./files";

const MAX_BACKUP_BYTES = 250 * 1024 * 1024;
/* eslint-disable @typescript-eslint/no-explicit-any */
const delegate = (client: unknown, name: string) => (client as Record<string, any>)[name];

// ---------------------------------------------------------------- files on disk

export function backupsDir(): string {
  const dir = process.env.BACKUPS_DIR ?? "./backups";
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}
export const isSafeBackupName = (n: string) => /^[A-Za-z0-9._-]+\.(json|zip)$/.test(n) && !n.includes("..");

export async function listBackupFiles() {
  try {
    const names = (await fs.readdir(backupsDir())).filter(isSafeBackupName);
    const out = await Promise.all(names.map(async (name) => ({ name, size: (await fs.stat(path.join(backupsDir(), name))).size, modifiedAt: (await fs.stat(path.join(backupsDir(), name))).mtime })));
    return out.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  } catch {
    return [];
  }
}

export async function deleteBackupFile(name: string) {
  if (!isSafeBackupName(name)) throw new Error("Invalid backup name");
  await fs.unlink(path.join(backupsDir(), name));
}

// ---------------------------------------------------------------- building

export async function buildBackup(now = new Date()): Promise<BackupFile> {
  const data: Record<string, Row[]> = {};
  const counts: Record<string, number> = {};
  const filePaths = new Set<string>();
  for (const t of BACKUP_TABLES) {
    const rows = (await delegate(db, t.delegate).findMany()) as Row[];
    data[t.name] = JSON.parse(JSON.stringify(rows)) as Row[]; // dates become ISO strings
    counts[t.name] = rows.length;
    if (t.files) for (const r of rows) if (typeof r.filePath === "string" && r.filePath) filePaths.add(r.filePath);
  }
  return {
    format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, appVersion: APP_VERSION, exportedAt: now.toISOString(), counts,
    files: [...filePaths].map((p) => ({ path: p, included: false })), data,
  };
}

export async function backupToBytes(withFiles: boolean, now = new Date()): Promise<{ bytes: Uint8Array; ext: "json" | "zip"; missingFiles: number }> {
  const backup = await buildBackup(now);
  if (!withFiles) return { bytes: strToU8(JSON.stringify(backup, null, 1)), ext: "json", missingFiles: 0 };
  const entries: Record<string, Uint8Array> = {};
  let missing = 0;
  for (const f of backup.files ?? []) {
    try {
      entries[`files/${f.path}`] = new Uint8Array(await fs.readFile(resolveStored(f.path)));
      f.included = true;
    } catch {
      missing++;
    }
  }
  entries["backup.json"] = strToU8(JSON.stringify(backup, null, 1));
  return { bytes: zipSync(entries, { level: 6 }), ext: "zip", missingFiles: missing };
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").slice(0, 15);

export async function writeBackupFile(prefix: "backup" | "auto" | "pre-restore", withFiles: boolean, now = new Date()) {
  const { bytes, ext, missingFiles } = await backupToBytes(withFiles, now);
  await fs.mkdir(backupsDir(), { recursive: true });
  const name = prefix === "auto" ? `auto-${dateKey(now)}.${ext}` : `${prefix}-${stamp(now)}.${ext}`;
  await fs.writeFile(path.join(backupsDir(), name), bytes);
  return { name, size: bytes.length, missingFiles };
}

/** Daily automatic backup (data only). Runs at most once per calendar day and prunes old automatic copies. */
export async function maybeAutoBackup(now = new Date()): Promise<{ created: boolean }> {
  const settings = await getSettings();
  if (!settings.autoBackup) return { created: false };
  const name = `auto-${dateKey(now)}.json`;
  const existing = await listBackupFiles();
  if (existing.some((f) => f.name === name)) return { created: false };
  await writeBackupFile("auto", false, now);
  const autos = (await listBackupFiles()).filter((f) => f.name.startsWith("auto-")).sort((a, b) => b.name.localeCompare(a.name));
  for (const old of autos.slice(settings.autoBackupKeep)) await deleteBackupFile(old.name).catch(() => undefined);
  return { created: true };
}

// ---------------------------------------------------------------- reading

export interface ParsedBackup {
  backup: BackupFile;
  files: Map<string, Uint8Array>;
  warnings: string[];
}

export function parseBackupBytes(bytes: Uint8Array): ParsedBackup {
  if (bytes.length === 0) throw new Error("The file is empty.");
  if (bytes.length > MAX_BACKUP_BYTES) throw new Error("The file is larger than 250 MB.");
  const files = new Map<string, Uint8Array>();
  let text: string;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes);
    } catch {
      throw new Error("The ZIP file is damaged or is not a ZIP archive.");
    }
    if (!entries["backup.json"]) throw new Error("This ZIP does not contain backup.json, so it is not a TaskPilot backup.");
    text = strFromU8(entries["backup.json"]);
    for (const [k, v] of Object.entries(entries)) if (k.startsWith("files/") && !k.endsWith("/")) files.set(k.slice("files/".length), v);
  } else {
    text = strFromU8(bytes);
  }
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error("The file could not be read as JSON. Is it a damaged or incomplete download?");
  }
  const v = validateBackup(obj);
  if (v.error) throw new Error(v.error);
  return { backup: obj as BackupFile, files, warnings: v.warnings };
}

// ---------------------------------------------------------------- planning against the real database

async function buildExistingIndex(): Promise<ExistingIndex> {
  const idx = emptyIndex();
  for (const t of BACKUP_TABLES) {
    const rows = (await delegate(db, t.delegate).findMany()) as Row[];
    idx.rows[t.name] = new Map(rows.map((r) => [rowKey(t, r), normRow(r)]));
    if (t.name === "Task") for (const r of rows) { idx.taskSeq.set(Number(r.seq), String(r.id)); idx.maxTaskSeq = Math.max(idx.maxTaskSeq, Number(r.seq)); }
    if (t.name === "Issue") for (const r of rows) { idx.issueSeq.set(Number(r.seq), String(r.id)); idx.maxIssueSeq = Math.max(idx.maxIssueSeq, Number(r.seq)); }
    if (t.name === "Tag") for (const r of rows) idx.tagByName.set(String(r.name), String(r.id));
    if (t.name === "UserPreference") for (const r of rows) idx.prefKeys.add(String(r.key));
    if (t.name === "DailyNote") for (const r of rows) idx.noteDates.add(String(r.date));
    if (t.name === "PlanItem") for (const r of rows) idx.planKeys.add(`${r.date}:${r.taskId}`);
    if (t.name === "TaskDependency") for (const r of rows) idx.depKeys.add(`${r.taskId}:${r.dependsOnTaskId}`);
    if (t.name === "Reminder") for (const r of rows) idx.reminderKeys.add(`${r.taskId ?? ""}|${r.issueId ?? ""}|${r.uatFeatureId ?? ""}|${r.type}`);
  }
  return idx;
}

async function makePlan(parsed: ParsedBackup, mode: RestoreMode): Promise<{ plan: RestorePlan; existingTotal: number }> {
  const idx = await buildExistingIndex();
  const existingTotal = Object.values(idx.rows).reduce((n, m) => n + m.size, 0);
  const plan = planRestore(parsed.backup, mode === "replace" ? emptyIndex() : idx, mode);
  return { plan, existingTotal };
}

export interface RestoreReport {
  mode: RestoreMode;
  backupInfo: { exportedAt?: string; appVersion?: string; schemaVersion: number; includesFiles: boolean };
  tables: { table: string; inBackup: number; toAdd: number; identical: number; differs: number; skipped: Record<string, number> }[];
  totals: { inBackup: number; toAdd: number; identical: number; differs: number; skipped: number };
  existingRecords: number;
  renumbered: { tasks: number; issues: number };
  warnings: string[];
  files: { referenced: number; availableInBackup: number };
}

const fileRowsOf = (plan: RestorePlan) =>
  plan.tables.filter((t) => BACKUP_TABLES.find((m) => m.name === t.table)?.files).flatMap((t) => t.insert).map((r) => String(r.filePath ?? "")).filter(Boolean);

/** Read-only: what would happen if this backup were restored now. Writes nothing. */
export async function analyzeRestore(parsed: ParsedBackup, mode: RestoreMode): Promise<RestoreReport> {
  const { plan, existingTotal } = await makePlan(parsed, mode);
  const tables = plan.tables.map((t) => ({ table: t.table, inBackup: t.inBackup, toAdd: t.insert.length, identical: t.identical, differs: t.differs, skipped: t.skipped }));
  const sum = (f: (t: (typeof tables)[number]) => number) => tables.reduce((n, t) => n + f(t), 0);
  const refs = fileRowsOf(plan);
  return {
    mode,
    backupInfo: { exportedAt: parsed.backup.exportedAt, appVersion: parsed.backup.appVersion, schemaVersion: parsed.backup.schemaVersion, includesFiles: parsed.files.size > 0 },
    tables,
    totals: { inBackup: sum((t) => t.inBackup), toAdd: sum((t) => t.toAdd), identical: sum((t) => t.identical), differs: sum((t) => t.differs), skipped: sum((t) => Object.values(t.skipped).reduce((a, b) => a + b, 0)) },
    existingRecords: existingTotal,
    renumbered: plan.renumbered,
    warnings: [...parsed.warnings, ...plan.warnings].slice(0, 20),
    files: { referenced: refs.length, availableInBackup: refs.filter((p) => parsed.files.has(p)).length },
  };
}

// ---------------------------------------------------------------- applying

export interface RestoreSummary {
  mode: RestoreMode;
  inserted: Record<string, number>;
  totalInserted: number;
  renumbered: { tasks: number; issues: number };
  snapshot: string;
  filesRestored: number;
  filesMissing: number;
}

const CHUNK = 200;

/**
 * Restores a backup. A safety snapshot of the current data is written first. The whole restore is one
 * transaction: if anything fails, nothing is changed. Merge mode only ever adds missing records.
 */
export async function applyRestore(parsed: ParsedBackup, mode: RestoreMode): Promise<RestoreSummary> {
  const { plan } = await makePlan(parsed, mode);
  const snapshot = await writeBackupFile("pre-restore", false);

  await db.$transaction(
    async (tx) => {
      if (mode === "replace") {
        for (const t of [...BACKUP_TABLES].reverse()) await delegate(tx, t.delegate).deleteMany();
      }
      for (const tp of plan.tables) {
        const meta = BACKUP_TABLES.find((m) => m.name === tp.table);
        if (!meta) continue;
        for (let i = 0; i < tp.insert.length; i += CHUNK) {
          await delegate(tx, meta.delegate).createMany({ data: tp.insert.slice(i, i + CHUNK) });
        }
      }
      // keep the task / issue numbering ahead of everything that exists
      for (const [kind, model] of [["task", "task"], ["issue", "issue"]] as const) {
        const max = ((await delegate(tx, model).aggregate({ _max: { seq: true } }))._max.seq as number | null) ?? 0;
        const key = `counter:${kind}`;
        const pref = await tx.userPreference.findUnique({ where: { key } });
        const next = Math.max(Number(pref?.value ?? 0), max);
        if (!pref || Number(pref.value) !== next) {
          await tx.userPreference.upsert({ where: { key }, create: { key, value: String(next) }, update: { value: String(next) } });
        }
      }
    },
    { maxWait: 15_000, timeout: 180_000 },
  );

  let filesRestored = 0;
  let filesMissing = 0;
  for (const rel of new Set(fileRowsOf(plan))) {
    const bytes = parsed.files.get(rel);
    if (!bytes) {
      filesMissing++;
      continue;
    }
    const abs = resolveStored(rel);
    try {
      await fs.access(abs);
    } catch {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, bytes);
      filesRestored++;
    }
  }

  const inserted = Object.fromEntries(plan.tables.filter((t) => t.insert.length).map((t) => [t.table, t.insert.length]));
  return { mode, inserted, totalInserted: Object.values(inserted).reduce((a, b) => a + b, 0), renumbered: plan.renumbered, snapshot: snapshot.name, filesRestored, filesMissing };
}

export { reviveRow };
