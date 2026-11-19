import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings-form";
import { SettingsTabs } from "@/components/settings-tabs";
import { APP_TZ } from "@/lib/dates";
import { getSettings } from "@/lib/engine-data";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Saved in your local database.</p>
      </div>
      <SettingsTabs active="general" />
      <SettingsForm initial={settings} timezone={APP_TZ} aiKeyConfigured={Boolean(process.env.GEMINI_API_KEY)} />
    </div>
  );
}
