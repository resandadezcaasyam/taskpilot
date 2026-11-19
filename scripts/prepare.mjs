#!/usr/bin/env node
/**
 * Runs automatically before `npm run dev` and `npm start`. It makes a fresh checkout start without manual steps:
 *   1. checks the Node.js version
 *   2. creates .env from .env.example, and the data / uploads / backups folders, if missing
 *   3. recognises a database created by an earlier TaskPilot version and marks the baseline migration as applied
 *   4. applies pending migrations (`prisma migrate deploy`). It never resets or deletes data.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const BASELINE = "20261119000000_init";
// columns that only exist in a complete (Phase 3 or later) database
const REQUIRED = {
  Task: ["blockedAt", "followUpDate"], Issue: ["escalationLevel"], Reminder: ["uatFeatureId", "issueId"], UatTestCase: ["linkedIssueId", "position"],
  UatFeature: ["fixDeployedAt", "manualTotal"], PlanItem: ["date"], DailyNote: ["date"], NextAction: ["pinned"], IssueUpdate: ["fileName"],
};

export function readEnvValue(cwd, key) {
  if (process.env[key]) return process.env[key];
  const file = path.join(cwd, ".env");
  if (!existsSync(file)) return undefined;
  const m = readFileSync(file, "utf8").match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\r\\n]*)"?`, "m"));
  return m ? m[1] : undefined;
}

export function databasePath(cwd) {
  const url = readEnvValue(cwd, "DATABASE_URL") || "file:./data/taskpilot.db";
  const p = url.replace(/^file:/, "");
  return path.isAbsolute(p) ? p : path.resolve(cwd, p);
}

/** Looks at an existing SQLite file without changing it. */
export function inspectDatabase(dbFile, Database) {
  if (!existsSync(dbFile)) return { exists: false };
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  try {
    const tables = new Set(db.prepare("select name from sqlite_master where type='table'").all().map((r) => r.name));
    if (!tables.has("Task")) return { exists: true, hasTask: false, applied: [], missing: [] };
    const applied = tables.has("_prisma_migrations") ? db.prepare("select migration_name n from _prisma_migrations").all().map((r) => r.n) : [];
    const missing = [];
    for (const [table, cols] of Object.entries(REQUIRED)) {
      if (!tables.has(table)) { missing.push(table); continue; }
      const have = new Set(db.prepare(`pragma table_info("${table}")`).all().map((c) => c.name));
      for (const c of cols) if (!have.has(c)) missing.push(`${table}.${c}`);
    }
    return { exists: true, hasTask: true, applied, missing };
  } finally {
    db.close();
  }
}

export async function prepare({ cwd = process.cwd(), run, log = console.log, Database }) {
  if (!existsSync(path.join(cwd, ".env")) && existsSync(path.join(cwd, ".env.example"))) {
    copyFileSync(path.join(cwd, ".env.example"), path.join(cwd, ".env"));
    log("Created .env from .env.example");
  }
  for (const d of ["data", "uploads", "backups"]) mkdirSync(path.join(cwd, d), { recursive: true });

  let info = { exists: false };
  try {
    info = inspectDatabase(databasePath(cwd), Database ?? (await import("better-sqlite3")).default);
  } catch (e) {
    log(`Note: could not inspect the existing database (${e.message}). Continuing.`);
  }
  if (info.exists && info.hasTask && !info.applied.includes(BASELINE)) {
    if (info.missing.length) {
      throw new Error(
        `Your existing database is from an older TaskPilot version and is missing: ${info.missing.join(", ")}.\n` +
          `Nothing was changed. Back it up (copy data/taskpilot.db), delete the folder prisma/migrations/${BASELINE}, then run:\n` +
          `  npx prisma migrate dev --name update`,
      );
    }
    log("Existing TaskPilot database detected. Marking the baseline migration as applied (your data is untouched).");
    const status = run(["migrate", "resolve", "--applied", BASELINE]);
    if (status !== 0) throw new Error("Could not register the baseline migration for your existing database.");
  }
  const status = run(["migrate", "deploy"]);
  if (status !== 0) throw new Error("Could not apply the database migrations.");
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 20 || (major === 20 && minor < 9)) {
    console.error(`TaskPilot needs Node.js 20.9 or newer (you have ${process.versions.node}). Download it from https://nodejs.org`);
    process.exit(1);
  }
  prepare({ run: (args) => spawnSync("npx", ["prisma", ...args], { stdio: "inherit", shell: true }).status ?? 1 }).catch((e) => {
    console.error(`\n${e.message}`);
    console.error("If this is the first run, make sure you ran `npm install` (it downloads what Prisma needs) and that you are online for that step.");
    process.exit(1);
  });
}
