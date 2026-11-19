"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { addDays, startOfToday } from "@/lib/dates";
import { maybeAutoBackup } from "@/lib/backup";
import { syncReminders } from "@/lib/engine-data";
import type { ActionResult } from "@/lib/validators";
import { safe } from "./_shared";

/** Polled by the open app. Only refreshes the UI when something actually changed. */
export async function refreshReminders(): Promise<ActionResult<{ changed: number }>> {
  try {
    const r = await syncReminders(new Date());
    await maybeAutoBackup(new Date()).catch((e) => console.error("[taskpilot] automatic backup failed:", e));
    if (r.changed > 0) revalidatePath("/", "layout");
    return { ok: true, data: r };
  } catch (e) {
    console.error("[taskpilot] reminder sync failed:", e);
    return { ok: false, error: "Could not refresh reminders" };
  }
}

export async function snoozeReminder(id: string, option: "1h" | "tomorrow" | "3days"): Promise<ActionResult> {
  const now = new Date();
  const until =
    option === "1h"
      ? new Date(now.getTime() + 3_600_000)
      : option === "tomorrow"
        ? new Date(addDays(startOfToday(now), 1).getTime() + 9 * 3_600_000) // 09:00 Jakarta
        : new Date(addDays(startOfToday(now), 3).getTime() + 9 * 3_600_000);
  return safe(async () => {
    await db.reminder.update({ where: { id }, data: { snoozedUntil: until } });
  });
}

export async function dismissReminder(id: string): Promise<ActionResult> {
  return safe(async () => {
    await db.reminder.update({ where: { id }, data: { dismissedAt: new Date() } });
  });
}
