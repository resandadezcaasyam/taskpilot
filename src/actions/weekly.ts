"use server";

import { db } from "@/lib/db";
import { WEEKLY_KEY } from "@/lib/weekly-data";
import { weeklyConfigSchema, type WeeklyConfig } from "@/lib/weekly";
import type { ActionResult } from "@/lib/validators";
import { safe } from "./_shared";

/** Saves your email template (recipients, greeting, headings, signature...) so it is ready next week. */
export async function saveWeeklyConfig(input: WeeklyConfig): Promise<ActionResult> {
  const parsed = weeklyConfigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid template" };
  const value = JSON.stringify(parsed.data);
  return safe(async () => {
    await db.userPreference.upsert({ where: { key: WEEKLY_KEY }, create: { key: WEEKLY_KEY, value }, update: { value } });
  });
}
