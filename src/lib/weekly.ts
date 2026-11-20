/**
 * Weekly report email (pure): week maths, the template configuration and the email formatter.
 * Nothing here touches the database, so the exact wording can be tested precisely.
 */
import { z } from "zod";

export const WEEKDAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const DAY_MS = 86_400_000;

// Calendar keys ("2026-08-17") are handled as plain UTC dates, so the result never depends on the computer's timezone.
const keyUTC = (key: string) => new Date(`${key}T00:00:00Z`);
const toKey = (d: Date) => d.toISOString().slice(0, 10);
export const isValidKey = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(keyUTC(key).getTime()) && toKey(keyUTC(key)) === key;
export const addKeyDays = (key: string, n: number) => toKey(new Date(keyUTC(key).getTime() + n * DAY_MS));
export const weekdayOf = (key: string) => keyUTC(key).getUTCDay(); // 0 = Sunday
export const weekdayNameId = (key: string) => WEEKDAYS_ID[weekdayOf(key)];
/** The Monday of the week containing `key`. */
export const mondayKey = (key: string) => addKeyDays(key, -((weekdayOf(key) + 6) % 7));
/** "17 Aug" */
export const shortDate = (key: string) => `${keyUTC(key).getUTCDate()} ${MONTHS_EN[keyUTC(key).getUTCMonth()]}`;

export interface WeekLabel {
  startKey: string;
  endKey: string; // Sunday
  month: string; // "Aug"
  weekNo: number; // week of the month
  label: string; // "Aug Week 3"
  range: string; // "17–23 Aug 2026"
}

/**
 * Weeks run Monday to Sunday and belong to the month that contains their Thursday (as in ISO weeks), so
 * 17-23 Aug 2026 is "Aug Week 3" and the week before it is "Aug Week 2".
 */
export function weekLabel(startKey: string): WeekLabel {
  const endKey = addKeyDays(startKey, 6);
  const thursday = keyUTC(addKeyDays(startKey, 3));
  const month = MONTHS_EN[thursday.getUTCMonth()];
  const weekNo = Math.ceil(thursday.getUTCDate() / 7);
  const s = keyUTC(startKey);
  const e = keyUTC(endKey);
  const range = s.getUTCMonth() === e.getUTCMonth()
    ? `${s.getUTCDate()}–${e.getUTCDate()} ${MONTHS_EN[e.getUTCMonth()]} ${e.getUTCFullYear()}`
    : `${shortDate(startKey)} – ${shortDate(endKey)} ${e.getUTCFullYear()}`;
  return { startKey, endKey, month, weekNo, label: `${month} Week ${weekNo}`, range };
}

export interface WeekInfo { plan: WeekLabel; last: WeekLabel }
export function weekInfo(planStartKey: string): WeekInfo {
  return { plan: weekLabel(planStartKey), last: weekLabel(addKeyDays(planStartKey, -7)) };
}

/** Monday to Wednesday: report last week and plan this week. Thursday onwards: report this week and plan next week. */
export function defaultPlanStartKey(todayKey: string): string {
  const dow = weekdayOf(todayKey);
  const monday = mondayKey(todayKey);
  return dow >= 1 && dow <= 3 ? monday : addKeyDays(monday, 7);
}

// ---------------------------------------------------------------- template configuration

export const PRODUCT_DASH_CHOICES = ["Yes", "No", "N/A", "Skip"] as const;

export const weeklyConfigSchema = z.object({
  to: z.string().trim().max(500),
  cc: z.string().trim().max(500),
  greeting: z.string().trim().min(1).max(200),
  greetingNames: z.string().trim().max(300),
  intro: z.string().trim().max(600),
  subject: z.string().trim().min(1).max(200),
  senderName: z.string().trim().max(80),
  headingDone: z.string().trim().min(1).max(80),
  headingPlan: z.string().trim().min(1).max(80),
  headingBlocked: z.string().trim().min(1).max(80),
  emptyText: z.string().trim().min(1).max(80),
  productDash: z.enum(PRODUCT_DASH_CHOICES),
  productDashLabel: z.string().trim().min(1).max(80),
  signature: z.string().max(1000),
  maxPlanItems: z.number().int().min(1).max(40),
});
export type WeeklyConfig = z.infer<typeof weeklyConfigSchema>;

export const DEFAULT_WEEKLY_CONFIG: WeeklyConfig = {
  to: "",
  cc: "",
  greeting: "Hi {names},",
  greetingNames: "",
  intro: "Berikut update saya untuk {lastWeek} kemarin, dan plan untuk {thisWeek}.",
  subject: "Weekly Plan {name} — {month} Week {week}",
  senderName: "",
  headingDone: "Done last week",
  headingPlan: "This week",
  headingBlocked: "Blocked / At risk",
  emptyText: "Tidak ada",
  productDash: "Yes",
  productDashLabel: "Product Dash updated",
  signature: "Regards,\n{name}",
  maxPlanItems: 10,
};

export function mergeWeeklyConfig(stored: unknown): WeeklyConfig {
  const parsed = weeklyConfigSchema.partial().safeParse(stored);
  return { ...DEFAULT_WEEKLY_CONFIG, ...(parsed.success ? parsed.data : {}) };
}

// ---------------------------------------------------------------- items shown in the editor

export type WeeklyKind = "done" | "plan" | "blocked";
export interface WeeklyItem {
  id: string;
  kind: WeeklyKind;
  /** TP-0012, ISS-0003, ... for the editor only; never part of the email text. */
  ref: string;
  text: string;
  included: boolean;
  source: "task" | "uat" | "issue" | "project" | "custom";
}
export interface WeeklyDraft {
  info: WeekInfo;
  planStartKey: string;
  done: WeeklyItem[];
  plan: WeeklyItem[];
  blocked: WeeklyItem[];
}

// ---------------------------------------------------------------- the email

const fill = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface EmailSections { done: string[]; plan: string[]; blocked: string[] }
export interface WeeklyEmail { subject: string; to: string; cc: string; text: string; html: string }

export function formatEmail(cfg: WeeklyConfig, info: WeekInfo, sections: EmailSections, displayName: string): WeeklyEmail {
  const sameMonth = info.last.month === info.plan.month;
  const weekText = (w: WeekLabel) => (sameMonth ? `week ${w.weekNo}` : `${w.month} week ${w.weekNo}`);
  const name = cfg.senderName.trim() || displayName.trim() || "";
  const vars = {
    name, month: info.plan.month, week: String(info.plan.weekNo), lastWeek: weekText(info.last), thisWeek: weekText(info.plan), names: cfg.greetingNames.trim(),
  };
  const tidy = (s: string) => s.replace(/\s+,/g, ",").replace(/ {2,}/g, " ").trim();
  const greeting = tidy(fill(cfg.greeting, vars));
  const intro = tidy(fill(cfg.intro, vars));
  const subject = tidy(fill(cfg.subject, vars));
  const signature = fill(cfg.signature, vars).replace(/\r\n/g, "\n").trimEnd();

  const blocks: { heading: string; items: string[] }[] = [
    { heading: cfg.headingDone, items: sections.done },
    { heading: cfg.headingPlan, items: sections.plan },
    { heading: cfg.headingBlocked, items: sections.blocked },
  ].map((b) => ({ ...b, items: b.items.map((i) => i.trim()).filter(Boolean) }));
  const itemsOrEmpty = (items: string[]) => (items.length ? items : [cfg.emptyText]);
  const dash = cfg.productDash === "Skip" ? "" : `${cfg.productDashLabel}: ${cfg.productDash}`;

  const text = [
    greeting, "", intro, "",
    ...blocks.flatMap((b) => [`${b.heading}:`, ...itemsOrEmpty(b.items).map((i) => `- ${i}`), ""]),
    ...(dash ? [dash, ""] : []),
    signature,
  ].join("\n").trimEnd();

  const p = (s: string) => `<p>${escapeHtml(s)}</p>`;
  const html = [
    p(greeting), intro ? p(intro) : "",
    ...blocks.map((b) => `${p(`${b.heading}:`)}<ul>${itemsOrEmpty(b.items).map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`),
    dash ? p(dash) : "",
    signature ? `<p>${signature.split("\n").map(escapeHtml).join("<br>")}</p>` : "",
  ].join("");

  return { subject, to: cfg.to, cc: cfg.cc, text, html };
}
