import type { Metadata } from "next";
import Link from "next/link";
import { Siren } from "lucide-react";
import { PriorityBadge } from "@/components/badges";
import { IssueStatusPill } from "@/components/pills";
import { NewIssueButton } from "@/components/issues-client";
import { Card, EmptyState } from "@/components/ui/card";
import { UrlFilters } from "@/components/url-filters";
import { daysFromToday, formatDate } from "@/lib/dates";
import { listIssues } from "@/lib/issue-data";
import { ISSUE_SEVERITIES, ISSUE_STATUSES, issueCode, isIssueOpen } from "@/lib/issues";
import { listProjectOptions } from "@/lib/queries";
import { cn, pluralize } from "@/lib/utils";

export const metadata: Metadata = { title: "Issues & Escalations" };
const QUICK = [["", "All"], ["open", "Open"], ["followup", "Follow-up due"], ["overdue", "Past expected resolution"]] as const;

export default async function IssuesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const quick = sp.quick === "open" || sp.quick === "followup" || sp.quick === "overdue" ? sp.quick : undefined;
  const [rows, projects] = await Promise.all([listIssues({ q: sp.q, status: sp.status, severity: sp.severity, project: sp.project, quick }), listProjectOptions()]);
  const openCount = rows.filter((r) => isIssueOpen(r.issue.status)).length;
  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v) p.set(k, v);
    return `/issues${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Issues &amp; escalations</h1>
          <p className="mt-1 text-sm text-muted-foreground">{pluralize(rows.length, "issue")} shown, {openCount} open. Most urgent first, with the next step for each.</p>
        </div>
        <NewIssueButton projects={projects} />
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick filters">
        {QUICK.map(([value, label]) => (
          <Link key={value} href={keep({ quick: value || undefined })} className={cn("rounded-full border px-3 py-1 text-xs font-medium", (quick ?? "") === value ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:text-foreground")}>{label}</Link>
        ))}
      </div>
      <UrlFilters
        basePath="/issues"
        current={sp}
        fields={[
          { key: "q", kind: "search", placeholder: "Search issues…" },
          { key: "status", kind: "select", label: "All statuses", options: ISSUE_STATUSES.map((s) => ({ value: s, label: s })) },
          { key: "severity", kind: "select", label: "All severities", options: ISSUE_SEVERITIES.map((s) => ({ value: s, label: s })) },
          { key: "project", kind: "select", label: "All projects", options: [{ value: "none", label: "No project" }, ...projects.map((p) => ({ value: p.id, label: p.name }))] },
        ]}
      />
      {rows.length === 0 ? (
        <Card><EmptyState icon={<Siren />} title={sp.q || sp.status || sp.severity || sp.project || quick ? "No issues match" : "No issues yet"} description="Track operational and technical issues from report to resolution, with escalation history and a recommended next step." action={sp.q || quick ? undefined : <NewIssueButton projects={projects} />} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">{["Issue", "Severity", "Status", "PIC", "Follow-up", "Next step"].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(({ issue: i, action }) => {
                  const late = i.nextFollowUpDate && isIssueOpen(i.status) && daysFromToday(i.nextFollowUpDate) <= 0;
                  return (
                    <tr key={i.id} className={cn("border-b border-border align-top last:border-0 hover:bg-muted/40", !isIssueOpen(i.status) && "text-muted-foreground")}>
                      <td className="px-3 py-3">
                        <Link href={`/issues/${i.id}`} className="font-medium hover:text-primary">{i.title}</Link>
                        <p className="mt-0.5 text-xs text-muted-foreground"><span className="font-mono">{issueCode(i.seq)}</span>{i.project ? ` · ${i.project.name}` : ""}{i.escalationLevel > 0 ? ` · escalated ${i.escalationLevel}×` : ""}</p>
                      </td>
                      <td className="px-3 py-3"><PriorityBadge priority={i.severity} /></td>
                      <td className="px-3 py-3"><IssueStatusPill value={i.status} /></td>
                      <td className="px-3 py-3 text-[13px]">{i.responsiblePic ?? "—"}</td>
                      <td className={cn("px-3 py-3 text-xs", late ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{formatDate(i.nextFollowUpDate)}</td>
                      <td className="max-w-[300px] px-3 py-3 text-[13px]">{action?.text ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
