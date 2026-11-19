import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { DateFormatInit, Providers } from "@/components/providers";
import { maybeAutoBackup } from "@/lib/backup";
import { dateKey, setDateFormat } from "@/lib/dates";
import { getActiveReminders, getSettings, reminderBadges, syncReminders, toReminderItem } from "@/lib/engine-data";
import { listProjectOptions } from "@/lib/queries";
import { mergeSettings, type EngineSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: { default: "TaskPilot", template: "%s · TaskPilot" },
  description: "Local-first task tracker and next action planner for Product Management.",
};

// Always read fresh data from SQLite; never serve a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const now = new Date();
  let projects: { id: string; name: string }[] = [];
  let reminders: Awaited<ReturnType<typeof getActiveReminders>> = [];
  let dbProblem = false;
  let settings: EngineSettings = mergeSettings(null);
  try {
    settings = await getSettings();
    setDateFormat(settings.dateFormat);
  } catch {
    // the banner below explains a missing or outdated database
  }
  try {
    await maybeAutoBackup(now);
  } catch (error) {
    console.error("[taskpilot] automatic backup failed:", error);
  }
  try {
    // Re-evaluate reminders on every load, so opening the app on a new day is always up to date.
    await syncReminders(now);
    [projects, reminders] = await Promise.all([listProjectOptions(), getActiveReminders(now)]);
  } catch (error) {
    console.error("[taskpilot] database is not ready:", error);
    dbProblem = true;
  }
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <DateFormatInit format={settings.dateFormat} />
        <Providers theme={settings.theme}>
          <AppShell
            projects={projects}
            reminders={reminders.map(toReminderItem)}
            badges={reminderBadges(reminders)}
            renderedDate={dateKey(now)}
            dbProblem={dbProblem}
          >{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
