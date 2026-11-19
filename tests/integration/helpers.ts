import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

/** Test files live in the OS temp folder, never in your data/ or uploads/ folders. */
export function tmp(name: string): string {
  const dir = path.join(os.tmpdir(), "taskpilot-tests");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}

/** Creates a fresh database by running the real migration files, exactly as `prisma migrate deploy` does. */
export function applyMigrations(dbFile: string): void {
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
  const root = path.resolve("prisma/migrations");
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const db = new Database(dbFile);
  for (const d of dirs) db.exec(fs.readFileSync(path.join(root, d, "migration.sql"), "utf8"));
  db.close();
}
