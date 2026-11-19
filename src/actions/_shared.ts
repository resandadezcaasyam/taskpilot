import { revalidatePath } from "next/cache";
import type { Tx } from "@/lib/db";
import type { ActionResult } from "@/lib/validators";

/** Runs a mutation and converts any failure into a visible error instead of swallowing it. */
export async function safe<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (error) {
    console.error("[taskpilot] write failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, error: `Could not save your change: ${message}` };
  }
}

/** Monotonic counters (task numbers are never reused, even after deletes). */
export async function nextSeq(tx: Tx, kind: "task" | "issue"): Promise<number> {
  const key = `counter:${kind}`;
  const pref = await tx.userPreference.findUnique({ where: { key } });
  const max =
    kind === "task"
      ? (await tx.task.aggregate({ _max: { seq: true } }))._max.seq ?? 0
      : (await tx.issue.aggregate({ _max: { seq: true } }))._max.seq ?? 0;
  const next = Math.max(Number(pref?.value ?? 0), max) + 1;
  await tx.userPreference.upsert({
    where: { key },
    create: { key, value: String(next) },
    update: { value: String(next) },
  });
  return next;
}
