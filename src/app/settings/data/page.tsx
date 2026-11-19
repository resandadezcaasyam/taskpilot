import type { Metadata } from "next";
import { BackupNow, DeleteBackupButton, DownloadLink, RestoreWizard } from "@/components/data-tools";
import { SettingsTabs } from "@/components/settings-tabs";
import { Card, SectionHeader } from "@/components/ui/card";
import { backupsDir, listBackupFiles } from "@/lib/backup";
import { formatDateTime } from "@/lib/dates";
import { EXPORT_ENTITIES } from "@/lib/export";
import { formatSize } from "@/lib/utils";

export const metadata: Metadata = { title: "Data and backup" };

const LABELS: Record<(typeof EXPORT_ENTITIES)[number], string> = {
  tasks: "Tasks", projects: "Projects", uat: "UAT features", "uat-test-cases": "UAT test cases", issues: "Issues", activity: "Activity history",
};

export default async function DataPage() {
  const backups = await listBackupFiles();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Everything stays on this computer. Nothing is uploaded anywhere.</p>
      </div>
      <SettingsTabs active="data" />

      <Card>
        <SectionHeader title="Back up" description={`Saved to ${backupsDir()}. Keep a copy somewhere else too (external drive, cloud folder).`} />
        <div className="space-y-4 px-5 pb-5">
          <BackupNow />
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            Or download directly:
            <DownloadLink href="/api/backup">Full backup (JSON)</DownloadLink>
            <DownloadLink href="/api/backup?files=1">Full backup with files (ZIP)</DownloadLink>
          </div>
          <p className="text-xs text-muted-foreground">A full backup contains every table and its relationships (tasks, projects, UAT, issues, reminders, planner, settings and history). The ZIP also contains attachments and evidence files.</p>
        </div>
      </Card>

      <Card>
        <SectionHeader title="Backups on this computer" description={backups.length ? `${backups.length} ${backups.length === 1 ? "file" : "files"}` : undefined} />
        {backups.length === 0 ? (
          <p className="px-5 pb-5 text-[13px] text-muted-foreground">No backups yet. Use &ldquo;Back up now&rdquo; or turn on automatic backups in General settings.</p>
        ) : (
          <ul>
            {backups.map((b) => (
              <li key={b.name} className="flex items-center justify-between gap-3 border-t border-border px-5 py-2.5 text-sm">
                <div className="min-w-0"><p className="truncate font-mono text-[13px]">{b.name}</p><p className="text-xs text-muted-foreground">{formatSize(b.size)} · {formatDateTime(b.modifiedAt)}</p></div>
                <div className="flex items-center gap-1"><DownloadLink href={`/api/backups/${encodeURIComponent(b.name)}`}>Download</DownloadLink><DeleteBackupButton name={b.name} /></div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionHeader title="Export" description="Excel (.xlsx) has filters, frozen headers and real dates, and adds related sheets (subtasks, comments, milestones, test cases, issue updates). CSV is a single flat table. JSON has every field." />
        <ul className="pb-2">
          <li className="flex items-center justify-between gap-3 border-t border-border bg-primary-soft/40 px-5 py-2.5 text-sm">
            <span className="font-medium">Everything in one Excel workbook</span>
            <DownloadLink href="/api/export/all?format=xlsx">Excel</DownloadLink>
          </li>
          {EXPORT_ENTITIES.map((e) => (
            <li key={e} className="flex items-center justify-between gap-3 border-t border-border px-5 py-2.5 text-sm">
              <span>{LABELS[e]}</span>
              <span className="flex gap-2"><DownloadLink href={`/api/export/${e}?format=xlsx`}>Excel</DownloadLink><DownloadLink href={`/api/export/${e}?format=csv`}>CSV</DownloadLink><DownloadLink href={`/api/export/${e}?format=json`}>JSON</DownloadLink></span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionHeader title="Restore from a backup" description="Choose a backup (.json or .zip), preview exactly what will change, then confirm. Nothing is changed until you confirm." />
        <div className="px-5 pb-5"><RestoreWizard /></div>
      </Card>
    </div>
  );
}
