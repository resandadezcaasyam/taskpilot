import type { Tx } from "./db";
import type { ActivityType } from "./constants";

export async function logActivity(
  tx: Tx,
  entry: {
    type: ActivityType;
    message: string;
    taskId?: string | null;
    projectId?: string | null;
    meta?: Record<string, unknown>;
  },
) {
  await tx.taskActivity.create({
    data: {
      type: entry.type,
      message: entry.message,
      taskId: entry.taskId ?? null,
      projectId: entry.projectId ?? null,
      meta: entry.meta ? JSON.stringify(entry.meta) : null,
    },
  });
}

export function parseMeta(meta: string | null): { code?: string; title?: string; href?: string } {
  if (!meta) return {};
  try {
    return JSON.parse(meta) as { code?: string; title?: string; href?: string };
  } catch {
    return {};
  }
}
