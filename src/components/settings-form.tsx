"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { resetEngineSettings, saveEngineSettings } from "@/actions/settings";
import { DATE_FORMATS, formatDateAs, setDateFormat } from "@/lib/dates";
import { DEFAULT_SETTINGS, type EngineSettings } from "@/lib/settings";

type NumKey = "inactivityDays" | "quickWinMinutes" | "workdayHours" | "deadlineLeadDays" | "blockerReminderDays" | "uatLeadDays" | "followUpSnoozeDays" | "autoBackupKeep";

const WEIGHTS: [keyof EngineSettings["weights"], string, string][] = [
  ["deadline", "Deadline urgency", "How close or overdue the deadline is."],
  ["priority", "Business priority", "Task priority and business importance."],
  ["followUp", "Follow-up / blocker urgency", "Blocked tasks, due follow-ups, waiting on others."],
  ["inactivity", "Inactivity", "How long since the task was last updated."],
  ["effort", "Estimated effort", "Quick tasks score higher."],
];

export function SettingsForm({ initial, timezone, aiKeyConfigured }: { initial: EngineSettings; timezone: string; aiKeyConfigured: boolean }) {
  const [s, setS] = useState<EngineSettings>(initial);
  const [pending, start] = useTransition();
  const { setTheme } = useTheme();
  const sum = Object.values(s.weights).reduce((a, b) => a + b, 0);
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const now = new Date();

  const apply = (next: EngineSettings) => {
    setDateFormat(next.dateFormat);
    setTheme(next.theme);
  };
  const save = () =>
    start(async () => {
      try {
        const r = await saveEngineSettings(s);
        if (!r.ok) return void toast.error(r.error);
        apply(s);
        toast.success("Settings saved");
      } catch {
        toast.error("Could not reach the local server. Is `npm run dev` still running?");
      }
    });
  const reset = () =>
    start(async () => {
      const r = await resetEngineSettings();
      if (!r.ok) return void toast.error(r.error);
      const d = structuredClone(DEFAULT_SETTINGS);
      setS(d);
      apply(d);
      toast.success("Defaults restored");
    });

  const field = (label: string, key: NumKey, hint: string, step = "1") => (
    <Field label={label} hint={hint}>
      <Input type="number" min={0} step={step} value={s[key]} onChange={(e) => setS({ ...s, [key]: num(e.target.value) })} />
    </Field>
  );

  return (
    <div className="space-y-5">
      <Card>
        <SectionHeader title="Profile and display" />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Display name" hint="Used in the dashboard greeting."><Input value={s.displayName} maxLength={60} onChange={(e) => setS({ ...s, displayName: e.target.value })} placeholder="e.g. Resanda" /></Field>
          <Field label="Date format" hint="Applies everywhere dates are shown.">
            <Select value={s.dateFormat} onChange={(e) => setS({ ...s, dateFormat: e.target.value as EngineSettings["dateFormat"] })}>
              {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}  ({formatDateAs(now, f)})</option>)}
            </Select>
          </Field>
          <Field label="Theme"><Select value={s.theme} onChange={(e) => setS({ ...s, theme: e.target.value as EngineSettings["theme"] })}><option value="system">Follow my system</option><option value="light">Light</option><option value="dark">Dark</option></Select></Field>
          <Field label="Default task view"><Select value={s.defaultTaskView} onChange={(e) => setS({ ...s, defaultTaskView: e.target.value as EngineSettings["defaultTaskView"] })}><option value="table">Table</option><option value="cards">Cards</option></Select></Field>
          <Field label="Dashboard layout" hint="Which column gets the wide side.">
            <Select value={s.dashboardLayout} onChange={(e) => setS({ ...s, dashboardLayout: e.target.value as EngineSettings["dashboardLayout"] })}><option value="focus">Today&apos;s focus first</option><option value="projects">Projects and reminders first</option></Select>
          </Field>
          <Field label="Timezone" hint="Set NEXT_PUBLIC_APP_TIMEZONE in .env, then restart. Fixed-offset zones only.">
            <Input value={timezone} readOnly disabled />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionHeader title="Priority scoring weights" description="Weights are relative, so they do not need to add up to 100. Each shows its effective share." />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          {WEIGHTS.map(([key, label, hint]) => (
            <Field key={key} label={`${label} (${sum ? Math.round((s.weights[key] / sum) * 100) : 0}%)`} hint={hint}>
              <Input type="number" min={0} max={100} value={s.weights[key]} onChange={(e) => setS({ ...s, weights: { ...s.weights, [key]: num(e.target.value) } })} />
            </Field>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader title="Engine and reminders" />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          {field("Inactivity threshold (days)", "inactivityDays", "A task with no update for this long counts as stale.")}
          {field("Quick win limit (minutes)", "quickWinMinutes", "Tasks with this much work left or less are quick wins.")}
          {field("Deadline reminder lead time (days)", "deadlineLeadDays", "Remind this many days before a deadline.")}
          {field("UAT target reminder lead time (days)", "uatLeadDays", "Remind this many days before a UAT target date.")}
          {field("Blocker reminder after (days)", "blockerReminderDays", "Remind when a task has been blocked this long.")}
          {field("Default next follow-up (days)", "followUpSnoozeDays", "Suggested gap when you record a follow-up.")}
          {field("Workday length (hours)", "workdayHours", "Used for the planner's workload indicator.", "0.5")}
        </div>
      </Card>

      <Card>
        <SectionHeader title="Database backup" description="Backups are saved on this computer in the backups/ folder." />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-1" checked={s.autoBackup} onChange={(e) => setS({ ...s, autoBackup: e.target.checked })} />
            <span><strong>Back up automatically once a day</strong> when TaskPilot is opened. Automatic backups contain your data but not attached files; use the ZIP option for those.</span>
          </label>
          {field("Automatic backups to keep", "autoBackupKeep", "Older automatic backups are deleted.")}
          <p className="self-end text-[13px] text-muted-foreground"><Link href="/settings/data" className="text-primary hover:underline">Back up now, export or restore →</Link></p>
        </div>
      </Card>

      <Card>
        <SectionHeader title="AI integration" description="Optional. TaskPilot works fully without it." />
        <div className="space-y-3 px-5 pb-5 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={s.aiEnabled} onChange={(e) => setS({ ...s, aiEnabled: e.target.checked })} />
            <span>Enable the AI assistant when it becomes available (Phase 5).</span>
          </label>
          <p className="text-[13px] text-muted-foreground">
            API key status: <strong className={aiKeyConfigured ? "text-emerald-600 dark:text-emerald-400" : ""}>{aiKeyConfigured ? "GEMINI_API_KEY is set on the server" : "not configured"}</strong>.
            The key is read from <code className="font-mono">.env</code> on the server and is never sent to the browser or saved in the database.
          </p>
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
        <Button variant="outline" onClick={reset} disabled={pending}>Restore defaults</Button>
      </div>
    </div>
  );
}
