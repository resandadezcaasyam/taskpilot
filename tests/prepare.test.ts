import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */
const load = async () => (await import(/* @vite-ignore */ path.resolve("scripts/prepare.mjs"))) as any;
const MIGRATION = fs.readFileSync(path.resolve("prisma/migrations/20261119000000_init/migration.sql"), "utf8");
const dirs: string[] = [];
const project = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "tp-prepare-"));
  dirs.push(d);
  fs.writeFileSync(path.join(d, ".env.example"), 'DATABASE_URL="file:./data/taskpilot.db"\n');
  return d;
};
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const make = (d: string, opts: { migrations?: string[]; sql?: string } = {}) => {
  fs.mkdirSync(path.join(d, "data"), { recursive: true });
  const db = new Database(path.join(d, "data", "taskpilot.db"));
  db.exec(opts.sql ?? MIGRATION);
  if (opts.migrations) {
    db.exec("create table _prisma_migrations (id text primary key, migration_name text not null)");
    for (const m of opts.migrations) db.prepare("insert into _prisma_migrations values (?, ?)").run(m, m);
  }
  db.close();
};
const runner = () => { const calls: string[][] = []; return { calls, run: (a: string[]) => (calls.push(a), 0) }; };

describe("scripts/prepare.mjs (runs before npm run dev)", () => {
  it("fresh checkout: creates .env and folders, then applies migrations", async () => {
    const { prepare } = await load();
    const d = project();
    const r = runner();
    await prepare({ cwd: d, run: r.run, log: () => {} });
    expect(fs.readFileSync(path.join(d, ".env"), "utf8")).toContain("DATABASE_URL");
    for (const f of ["data", "uploads", "backups"]) expect(fs.existsSync(path.join(d, f))).toBe(true);
    expect(r.calls).toEqual([["migrate", "deploy"]]);
  });
  it("never overwrites an existing .env", async () => {
    const { prepare } = await load();
    const d = project();
    fs.writeFileSync(path.join(d, ".env"), 'DATABASE_URL="file:./mine.db"\nSECRET=1\n');
    await prepare({ cwd: d, run: runner().run, log: () => {} });
    expect(fs.readFileSync(path.join(d, ".env"), "utf8")).toContain("SECRET=1");
  });
  it("existing complete database from an earlier version: baseline is registered, then deploy", async () => {
    const { prepare, BASELINE } = await load();
    const d = project();
    make(d, { migrations: ["20260601_init", "20260610_phase2", "20260620_phase3"] });
    const r = runner();
    await prepare({ cwd: d, run: r.run, log: () => {} });
    expect(r.calls).toEqual([["migrate", "resolve", "--applied", BASELINE], ["migrate", "deploy"]]);
  });
  it("database already on the baseline: only deploy", async () => {
    const { prepare, BASELINE } = await load();
    const d = project();
    make(d, { migrations: [BASELINE] });
    const r = runner();
    await prepare({ cwd: d, run: r.run, log: () => {} });
    expect(r.calls).toEqual([["migrate", "deploy"]]);
  });
  it("an older, incomplete database is left untouched with clear instructions", async () => {
    const { prepare } = await load();
    const d = project();
    make(d, { sql: 'create table "Task" ("id" text primary key, "title" text)', migrations: ["20260601_init"] });
    const r = runner();
    await expect(prepare({ cwd: d, run: r.run, log: () => {} })).rejects.toThrow(/older TaskPilot version.*Nothing was changed/s);
    expect(r.calls).toEqual([]);
  });
  it("reports a failing migration instead of continuing", async () => {
    const { prepare } = await load();
    await expect(prepare({ cwd: project(), run: () => 1, log: () => {} })).rejects.toThrow(/Could not apply/);
  });
  it("honours DATABASE_URL from .env", async () => {
    const { databasePath } = await load();
    const d = project();
    fs.writeFileSync(path.join(d, ".env"), 'DATABASE_URL="file:./custom/my.db"\n');
    expect(databasePath(d)).toBe(path.join(d, "custom", "my.db"));
  });
});
