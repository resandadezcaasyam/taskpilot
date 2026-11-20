import type { Metadata } from "next";
import { WeeklyReport } from "@/components/weekly-report";
import { dateKey } from "@/lib/dates";
import { getSettings } from "@/lib/engine-data";
import { addKeyDays, defaultPlanStartKey, isValidKey, mondayKey } from "@/lib/weekly";
import { buildWeeklyDraft, getWeeklyConfig } from "@/lib/weekly-data";

export const metadata: Metadata = { title: "Weekly Report" };

export default async function WeeklyPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams;
  const now = new Date();
  const defaultKey = defaultPlanStartKey(dateKey(now));
  const key = sp.week && isValidKey(sp.week) ? mondayKey(sp.week) : defaultKey;
  const [config, settings] = await Promise.all([getWeeklyConfig(), getSettings()]);
  const draft = await buildWeeklyDraft(key, now, config.maxPlanItems);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Weekly report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your weekly update email, written from your tasks: what you finished last week, what you plan this week, and what is blocked or at risk. Check it, adjust any line, then copy it into your email. Nothing is sent from TaskPilot.
        </p>
      </div>
      <WeeklyReport key={key} draft={draft} config={config} displayName={settings.displayName} prevKey={addKeyDays(key, -7)} nextKey={addKeyDays(key, 7)} defaultKey={defaultKey} />
    </div>
  );
}
