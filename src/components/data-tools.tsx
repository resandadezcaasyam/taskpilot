"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Download, FileUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { createBackupNow, previewRestore, removeBackupFile, restoreBackup } from "@/actions/backup";
import type { RestoreReport, RestoreSummary } from "@/lib/backup";
import { cn, formatSize } from "@/lib/utils";

const OFFLINE = "Could not reach the local server. Is `npm run dev` still running?";

export function BackupNow() {
  const [pending, start] = useTransition();
  const run = (withFiles: boolean) =>
    start(async () => {
      try {
        const r = await createBackupNow(withFiles);
        if (!r.ok) return void toast.error(r.error);
        toast.success(`Saved ${r.data.name} (${formatSize(r.data.size)})${r.data.missingFiles ? `. ${r.data.missingFiles} attached files were missing and were skipped.` : ""}`);
      } catch {
        toast.error(OFFLINE);
      }
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => run(false)} disabled={pending}>{pending ? "Working…" : "Back up now (data)"}</Button>
      <Button variant="outline" onClick={() => run(true)} disabled={pending}>Back up now with files (ZIP)</Button>
    </div>
  );
}

export function DeleteBackupButton({ name }: { name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="icon" variant="ghost" aria-label={`Delete ${name}`} disabled={pending} onClick={() => { if (confirm(`Delete ${name}? This cannot be undone.`)) start(async () => { const r = await removeBackupFile(name); if (!r.ok) toast.error(r.error); else toast.success("Backup deleted"); }); }}>
      <Trash2 />
    </Button>
  );
}

type Mode = "merge" | "replace";

export function RestoreWizard() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("merge");
  const [report, setReport] = useState<RestoreReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [done, setDone] = useState<RestoreSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const form = (extra?: Record<string, string>) => {
    const fd = new FormData();
    if (file) fd.set("file", file);
    fd.set("mode", mode);
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    return fd;
  };
  const reset = () => { setReport(null); setError(null); setDone(null); setConfirmText(""); };

  async function preview() {
    if (!file) return;
    setBusy(true); reset();
    try {
      const r = await previewRestore(form());
      if (!r.ok) setError(r.error);
      else setReport(r.data);
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    setBusy(true);
    try {
      const r = await restoreBackup(form({ confirm: confirmText }));
      if (!r.ok) return void toast.error(r.error);
      setDone(r.data); setReport(null);
      toast.success(`Restore complete: ${r.data.totalInserted} records added`);
      router.refresh();
    } catch {
      toast.error(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  const replace = mode === "replace";
  const canRestore = report && (!replace || confirmText.trim() === "REPLACE");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept=".json,.zip,application/json,application/zip" className="sr-only" aria-label="Backup file" onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }} />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}><FileUp /> {file ? "Choose another file" : "Choose backup file"}</Button>
        {file && <span className="text-[13px] text-muted-foreground">{file.name} · {formatSize(file.size)}</span>}
      </div>

      <fieldset className="grid gap-2 sm:grid-cols-2" disabled={busy}>
        <legend className="sr-only">Restore mode</legend>
        {([["merge", "Add what is missing (recommended)", "Records that already exist are never changed or overwritten. Duplicates are skipped."], ["replace", "Replace everything", "Deletes all current data first, then loads the backup. A safety snapshot is saved before anything is deleted."]] as const).map(([value, title, desc]) => (
          <label key={value} className={cn("flex cursor-pointer gap-2.5 rounded-lg border p-3 text-sm", mode === value ? "border-primary bg-primary-soft/50" : "border-border")}>
            <input type="radio" name="restore-mode" className="mt-1" checked={mode === value} onChange={() => { setMode(value); reset(); }} />
            <span><span className="block font-medium">{title}</span><span className="text-[13px] text-muted-foreground">{desc}</span></span>
          </label>
        ))}
      </fieldset>

      <Button onClick={preview} disabled={!file || busy}>{busy && !report ? "Checking…" : "Preview what will happen"}</Button>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>}

      {report && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-[13px] text-muted-foreground">
            Backup from {report.backupInfo.exportedAt ? new Date(report.backupInfo.exportedAt).toLocaleString("en-GB") : "unknown date"}
            {report.backupInfo.appVersion ? ` · TaskPilot ${report.backupInfo.appVersion}` : ""} · {report.backupInfo.includesFiles ? "includes attached files" : "data only (no attached files)"}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([["Records in backup", report.totals.inBackup], ["Will be added", report.totals.toAdd], [replace ? "Existing, to be deleted" : "Already here (unchanged)", replace ? report.existingRecords : report.totals.identical], [replace ? "Skipped" : "Different, yours kept", replace ? report.totals.skipped : report.totals.differs + report.totals.skipped]] as const).map(([k, v]) => (
              <div key={k}><p className="text-xs text-muted-foreground">{k}</p><p className="text-2xl font-semibold tabular-nums">{v}</p></div>
            ))}
          </div>
          {replace && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:bg-red-950/40 dark:text-red-200"><strong>{report.existingRecords} current records will be deleted</strong> and replaced by the backup. Files in uploads/ are not deleted.</p>}
          {!replace && (report.renumbered.tasks > 0 || report.renumbered.issues > 0) && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{report.renumbered.tasks} tasks and {report.renumbered.issues} issues have numbers already in use here, so they will get new numbers.</p>}
          {report.files.referenced > 0 && <p className="text-[13px] text-muted-foreground">Attached files: {report.files.availableInBackup} of {report.files.referenced} are in this backup{report.files.availableInBackup < report.files.referenced ? ". The rest will be restored as records without their file." : "."}</p>}
          {report.warnings.length > 0 && <ul className="max-h-28 space-y-1 overflow-y-auto rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="px-3 py-2">Table</th><th className="px-3 py-2">In backup</th><th className="px-3 py-2">Add</th><th className="px-3 py-2">Already here</th><th className="px-3 py-2">Different</th><th className="px-3 py-2">Skipped</th></tr></thead>
              <tbody>
                {report.tables.filter((t) => t.inBackup > 0).map((t) => (
                  <tr key={t.table} className="border-t border-border">
                    <td className="px-3 py-1.5">{t.table}</td><td className="px-3 py-1.5 tabular-nums">{t.inBackup}</td><td className="px-3 py-1.5 tabular-nums">{t.toAdd}</td>
                    <td className="px-3 py-1.5 tabular-nums">{t.identical}</td><td className="px-3 py-1.5 tabular-nums">{t.differs}</td>
                    <td className="px-3 py-1.5" title={Object.entries(t.skipped).map(([r, n]) => `${n}: ${r}`).join("; ")}>{Object.values(t.skipped).reduce((a, b) => a + b, 0) || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {replace && (
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Type REPLACE to confirm</span>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="REPLACE" className="max-w-xs" autoComplete="off" />
            </label>
          )}
          <div className="flex items-center gap-2">
            <Button variant={replace ? "destructive" : "default"} disabled={!canRestore || busy} onClick={restore}>{busy ? "Restoring…" : replace ? "Replace all data" : `Add ${report.totals.toAdd} missing records`}</Button>
            <Button variant="ghost" onClick={reset} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}

      {done && (
        <div role="status" className="space-y-1 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <p className="font-medium">Restore complete: {done.totalInserted} records added{done.filesRestored ? `, ${done.filesRestored} files restored` : ""}.</p>
          <p className="text-[13px]">A safety snapshot of your previous data was saved as <code className="font-mono">{done.snapshot}</code>.{done.renumbered.tasks + done.renumbered.issues > 0 ? ` ${done.renumbered.tasks} tasks and ${done.renumbered.issues} issues were renumbered.` : ""}{done.filesMissing ? ` ${done.filesMissing} attached files were not in the backup.` : ""}</p>
        </div>
      )}
    </div>
  );
}

export function DownloadLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} download className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 text-[13px] font-medium hover:bg-muted"><Download className="size-3.5" />{children}</a>;
}
