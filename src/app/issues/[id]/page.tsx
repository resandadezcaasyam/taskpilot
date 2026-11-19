import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PriorityBadge } from "@/components/badges";
import { IssueDetailActions, UpdateComposer } from "@/components/issues-client";
import { FileChip } from "@/components/file-upload";
import { IssueStatusPill } from "@/components/pills";
import { Badge } from "@/components/ui/misc";
import { Card, SectionHeader } from "@/components/ui/card";
import { addDays, dateKey, formatDate, formatDateTime, startOfToday } from "@/lib/dates";
import { getIssue } from "@/lib/issue-data";
import { getSettings } from "@/lib/engine-data";
import { issueCode } from "@/lib/issues";
import { listProjectOptions } from "@/lib/queries";

const KIND_TONE: Record<string, string> = {
  Escalation: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  Resolution: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  Status: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  Update: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
};

export default async function IssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, projects, settings] = await Promise.all([getIssue(id), listProjectOptions(), getSettings()]);
  if (!data) notFound();
  const { issue: i, action } = data;
  const rows: [string, React.ReactNode][] = [
    ["Project", i.project ? <Link key="p" href={`/projects/${i.project.id}`} className="hover:text-primary">{i.project.name}</Link> : "—"],
    ["Category", i.category ?? "—"], ["Reported by", i.reportedBy ?? "—"], ["Responsible PIC", i.responsiblePic ?? "—"],
    ["Reported", formatDate(i.reportedDate)], ["Next follow-up", formatDate(i.nextFollowUpDate)],
    ["Expected resolution", formatDate(i.expectedResolution)], ["Actual resolution", formatDate(i.actualResolution)],
    ["Escalations", String(i.escalationLevel)],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/issues" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> Issues</Link>
        <p className="mt-2 font-mono text-xs text-muted-foreground">{issueCode(i.seq)}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{i.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3"><IssueStatusPill value={i.status} /><PriorityBadge priority={i.severity} /></div>
        <div className="mt-4">
          <IssueDetailActions issue={i} status={i.status} projects={projects} followUpDefault={dateKey(addDays(startOfToday(), settings.followUpSnoozeDays))} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {action && (
            <Card className="border-primary/25 p-5">
              <p className="text-[13px] font-medium text-primary">Recommended next step · {action.kind}</p>
              <p className="mt-1 text-[15px]">{action.text}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">Urgency {action.urgency}/100</p>
            </Card>
          )}
          <Card className="space-y-4 p-5 text-sm">
            {([["Description", i.description], ["Impact", i.impact], ["Workaround", i.workaround], ["Root cause", i.rootCause]] as const).map(([k, v]) => (
              <div key={k}><p className="text-[13px] font-medium">{k}</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{v || "Not recorded yet."}</p></div>
            ))}
          </Card>
          <UpdateComposer issueId={i.id} />
          <Card>
            <SectionHeader title="Investigation and escalation history" description={`${i.updates.length} entries`} />
            <ol className="pb-2">
              {i.updates.map((u) => (
                <li key={u.id} className="space-y-1.5 border-t border-border px-5 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <Badge className={KIND_TONE[u.kind] ?? ""}>{u.kind}</Badge>
                    <time dateTime={u.createdAt.toISOString()} className="text-xs text-muted-foreground">{formatDateTime(u.createdAt)}</time>
                  </div>
                  <p className="whitespace-pre-wrap text-[13.5px]">{u.message}</p>
                  {u.filePath && <FileChip kind="issue-update" id={u.id} name={u.fileName ?? "attachment"} size={u.sizeBytes} />}
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="space-y-5">
          <Card className="p-5">
            <dl className="divide-y divide-border text-sm">
              {rows.map(([k, v]) => (<div key={k} className="flex items-center justify-between gap-3 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v}</dd></div>))}
            </dl>
          </Card>
          {i.testCases.length > 0 && (
            <Card className="p-5 text-sm">
              <p className="mb-2 text-[13px] font-medium">Linked UAT test cases</p>
              <ul className="space-y-1.5">
                {i.testCases.map((t) => (<li key={t.id}><Link href={`/uat/${t.feature.id}`} className="hover:text-primary">{t.title}</Link><span className="block text-xs text-muted-foreground">{t.feature.name}</span></li>))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
