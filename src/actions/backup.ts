"use server";

import { z } from "zod";
import { analyzeRestore, applyRestore, deleteBackupFile, parseBackupBytes, writeBackupFile, type RestoreReport, type RestoreSummary } from "@/lib/backup";
import type { RestoreMode } from "@/lib/backup-meta";
import type { ActionResult } from "@/lib/validators";
import { safe } from "./_shared";

const modeSchema = z.enum(["merge", "replace"]);

async function readUpload(form: FormData) {
  const f = form.get("file");
  if (!f || typeof f === "string" || (f as File).size === 0) throw new Error("Choose a backup file first.");
  return parseBackupBytes(new Uint8Array(await (f as File).arrayBuffer()));
}

export async function createBackupNow(withFiles: boolean): Promise<ActionResult<{ name: string; size: number; missingFiles: number }>> {
  return safe(() => writeBackupFile("backup", withFiles));
}

export async function removeBackupFile(name: string): Promise<ActionResult> {
  return safe(() => deleteBackupFile(name));
}

/** Step 1 of a restore: validates the file and reports exactly what would change. Writes nothing. */
export async function previewRestore(form: FormData): Promise<ActionResult<RestoreReport>> {
  try {
    const mode = modeSchema.safeParse(form.get("mode") ?? "merge");
    if (!mode.success) return { ok: false, error: "Unknown restore mode" };
    return { ok: true, data: await analyzeRestore(await readUpload(form), mode.data) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the backup" };
  }
}

/** Step 2: applies it. Replace mode needs the word REPLACE typed as confirmation. */
export async function restoreBackup(form: FormData): Promise<ActionResult<RestoreSummary>> {
  const mode = modeSchema.safeParse(form.get("mode"));
  if (!mode.success) return { ok: false, error: "Choose a restore mode" };
  if ((mode.data as RestoreMode) === "replace" && String(form.get("confirm") ?? "").trim() !== "REPLACE") {
    return { ok: false, error: "Type REPLACE to confirm replacing all current data." };
  }
  let parsed;
  try {
    parsed = await readUpload(form);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the backup" };
  }
  return safe(() => applyRestore(parsed, mode.data));
}
