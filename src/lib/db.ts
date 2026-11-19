import fs from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Resolves the SQLite file from DATABASE_URL (default ./data/taskpilot.db),
 * always relative to the project root, never to .next or a temp directory.
 */
export function resolveDatabasePath(): string {
  const raw = process.env.DATABASE_URL ?? "file:./data/taskpilot.db";
  const filePath = raw.replace(/^file:/, "");
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  return abs;
}

function createClient() {
  const adapter = new PrismaBetterSqlite3({ url: `file:${resolveDatabasePath()}` });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
