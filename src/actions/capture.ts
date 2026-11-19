"use server";

import { db } from "@/lib/db";
import { ROUTINE_KEY } from "@/lib/capture-data";
import type { ActionResult } from "@/lib/validators";
import { safe } from "./_shared";

/** The routine is a list of lines (your regular daily activities) you can drop into Brain Dump in one click. */
export async function saveRoutine(text: string): Promise<ActionResult> {
  const value = text.replace(/\r\n/g, "\n").trim();
  if (value.length > 5000) return { ok: false, error: "Keep the routine under 5000 characters." };
  return safe(async () => {
    await db.userPreference.upsert({ where: { key: ROUTINE_KEY }, create: { key: ROUTINE_KEY, value }, update: { value } });
  });
}
