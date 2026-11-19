import { z } from "zod";
import { DATE_FORMATS } from "./dates";

/** Weights are relative (they are normalised), so they do not have to add up to 100. */
export const engineSettingsSchema = z.object({
  weights: z.object({
    deadline: z.number().int().min(0).max(100),
    priority: z.number().int().min(0).max(100),
    followUp: z.number().int().min(0).max(100),
    inactivity: z.number().int().min(0).max(100),
    effort: z.number().int().min(0).max(100),
  }),
  inactivityDays: z.number().int().min(1).max(30),
  quickWinMinutes: z.number().int().min(5).max(120),
  workdayHours: z.number().min(1).max(14),
  deadlineLeadDays: z.number().int().min(0).max(14),
  blockerReminderDays: z.number().int().min(1).max(30),
  uatLeadDays: z.number().int().min(0).max(30),
  followUpSnoozeDays: z.number().int().min(1).max(14),
  // profile and display
  displayName: z.string().trim().max(60),
  dateFormat: z.enum(DATE_FORMATS),
  theme: z.enum(["system", "light", "dark"]),
  defaultTaskView: z.enum(["table", "cards"]),
  dashboardLayout: z.enum(["focus", "projects"]),
  // data and integrations
  autoBackup: z.boolean(),
  autoBackupKeep: z.number().int().min(1).max(60),
  aiEnabled: z.boolean(),
});
export type EngineSettings = z.infer<typeof engineSettingsSchema>;

export const DEFAULT_SETTINGS: EngineSettings = {
  weights: { deadline: 30, priority: 25, followUp: 20, inactivity: 15, effort: 10 },
  inactivityDays: 3,
  quickWinMinutes: 30,
  workdayHours: 6,
  deadlineLeadDays: 2,
  blockerReminderDays: 2,
  uatLeadDays: 5,
  followUpSnoozeDays: 3,
  displayName: "",
  dateFormat: "dd MMM yyyy",
  theme: "system",
  defaultTaskView: "table",
  dashboardLayout: "focus",
  autoBackup: true,
  autoBackupKeep: 7,
  aiEnabled: false,
};

/** Merges stored (possibly partial or outdated) settings over the defaults. */
export function mergeSettings(stored: unknown): EngineSettings {
  const base = structuredClone(DEFAULT_SETTINGS);
  if (!stored || typeof stored !== "object") return base;
  const s = stored as Partial<EngineSettings>;
  const merged = { ...base, ...s, weights: { ...base.weights, ...(s.weights ?? {}) } };
  const parsed = engineSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : base;
}
