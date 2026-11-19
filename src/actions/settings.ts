"use server";

import { db } from "@/lib/db";
import { SETTINGS_KEY } from "@/lib/engine-data";
import { DEFAULT_SETTINGS, engineSettingsSchema, type EngineSettings } from "@/lib/settings";
import type { ActionResult } from "@/lib/validators";
import { safe } from "./_shared";

async function store(s: EngineSettings) {
  await db.userPreference.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: JSON.stringify(s) },
    update: { value: JSON.stringify(s) },
  });
}

export async function saveEngineSettings(input: EngineSettings): Promise<ActionResult> {
  const v = engineSettingsSchema.safeParse(input);
  if (!v.success) return { ok: false, error: v.error.issues[0]?.message ?? "Invalid settings" };
  const w = v.data.weights;
  if (w.deadline + w.priority + w.followUp + w.inactivity + w.effort === 0) {
    return { ok: false, error: "At least one scoring weight must be above 0" };
  }
  return safe(() => store(v.data));
}

export async function resetEngineSettings(): Promise<ActionResult> {
  return safe(() => store(structuredClone(DEFAULT_SETTINGS)));
}

/** Called by the header theme toggle so the choice lives in the database, not only in the browser. */
export async function saveThemePreference(theme: string): Promise<ActionResult> {
  if (theme !== "light" && theme !== "dark" && theme !== "system") return { ok: false, error: "Unknown theme" };
  try {
    const { getSettings } = await import("@/lib/engine-data");
    const s = await getSettings();
    if (s.theme === theme) return { ok: true, data: undefined };
    await store({ ...s, theme });
    return { ok: true, data: undefined };
  } catch (e) {
    console.error("[taskpilot] theme save failed:", e);
    return { ok: false, error: "Could not save the theme" };
  }
}
