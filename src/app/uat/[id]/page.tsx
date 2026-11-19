import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Card, SectionHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { SignOffPill, UatStatusPill } from "@/components/pills";
import { TestCasesPanel, UatDetailActions } from "@/components/uat-client";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { listProjectOptions } from "@/lib/queries";
import { getUatFeature } from "@/lib/uat-data";

export default async function UatDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, projects, issues] = await Promise.all([
    getUatFeature(id),
    listProjectOptions(),
    db.issue.findMany({ select: { id: true, seq: true, title: true }, orderBy: { seq: "desc" }, take: 300 }),
  ]);
  if (!data) notFound();
  const { feature: f, counts, metrics, actions, suggestedStatus, source } = data;

  const cards = [
    { label: "Execution progress", value: `${metrics.executionProgress}%`, hint: "(passed + failed) ÷ total" },
    { label: "Pass rate", value: metrics.passRate === null ? "n/a" : `${metrics.passRate}%`, hint: "passed ÷ executed" },
    { label: "Passed of total", value: `${counts.passed}/${counts.total}`, hint: `${metrics.passedShare}% of all cases` },
    { label: "Remaining", value: String(metrics.remaining), hint: "not run + blocked" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/uat" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> UAT tracker</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{f.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <UatStatusPill value={f.status} /><SignOffPill value={f.signOffStatus} />
              {f.project && <Link href={`/projects/${f.project.id}`} className="hover:text-primary">{f.project.name}</Link>}
              {f.releaseVersion && <span>{f.releaseVersion}</span>}
              {f.environment && <span>{f.environment}</span>}
              {f.owner && <span>Owner: {f.owner}</span>}
              {f.targetDate && <span>Target {formatDate(f.targetDate)}</span>}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <UatDetailActions feature={f} projects={projects} counts={counts} fixDeployed={Boolean(f.fixDeployedAt)} suggestedStatus={suggestedStatus} />
        </div>
      </div>

      <section aria-label="Metrics" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <p className="text-[13px] text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{c.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
          </Card>
        ))}
      </section>
      <Card className="space-y-3 p-5">
        <Progress value={metrics.executionProgress} className="h-2" tone={counts.failed > 0 ? "danger" : undefined} />
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="text-emerald-600 dark:text-emerald-400">{counts.passed} passed</span><span className="text-red-600 dark:text-red-400">{counts.failed} failed</span>
          <span className="text-amber-600 dark:text-amber-400">{counts.blocked} blocked</span><span className="text-muted-foreground">{counts.notRun} not run</span>
        </p>
        {source === "manual" && <p className="text-xs text-muted-foreground">These counts were entered manually. Add or import test cases to track them individually.</p>}
        {f.remarks && <p className="whitespace-pre-wrap border-t border-border pt-3 text-sm text-muted-foreground">{f.remarks}</p>}
      </Card>

      <Card>
        <SectionHeader title="What to do next" description="Recalculated from the current results" />
        {actions.length === 0 ? (
          <p className="px-5 pb-5 text-[13px] text-muted-foreground">Nothing needed. This UAT is signed off or completed.</p>
        ) : (
          <ol className="pb-2">
            {actions.map((a, i) => (
              <li key={a.text} className="flex items-start gap-3 border-t border-border px-5 py-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{i + 1}</span>
                <p className={i === 0 ? "text-sm font-medium" : "text-sm text-muted-foreground"}>{a.text}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <TestCasesPanel
        featureId={f.id}
        issueOptions={issues}
        cases={f.testCases.map((t) => ({
          id: t.id, title: t.title, prerequisites: t.prerequisites, steps: t.steps, expectedResult: t.expectedResult, actualResult: t.actualResult,
          result: t.result, remarks: t.remarks, linkedBug: t.linkedBug, retestCount: t.retestCount,
          evidence: t.evidence.map((e) => ({ id: e.id, fileName: e.fileName, sizeBytes: e.sizeBytes })), linkedIssue: t.linkedIssue,
        }))}
      />
    </div>
  );
}
