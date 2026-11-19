import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { Card, EmptyState } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { SignOffPill, UatStatusPill } from "@/components/pills";
import { NewUatButton } from "@/components/uat-client";
import { UrlFilters } from "@/components/url-filters";
import { formatDate } from "@/lib/dates";
import { daysFromToday } from "@/lib/dates";
import { listProjectOptions } from "@/lib/queries";
import { listUatFeatures } from "@/lib/uat-data";
import { UAT_STATUSES } from "@/lib/uat";
import { cn, pluralize } from "@/lib/utils";

export const metadata: Metadata = { title: "UAT Tracker" };

export default async function UatPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [rows, projects] = await Promise.all([listUatFeatures({ project: sp.project, status: sp.status, q: sp.q }), listProjectOptions()]);
  const active = rows.filter((r) => r.feature.status !== "Completed");
  const blocked = rows.filter((r) => r.feature.status === "Blocked" || r.counts.blocked > 0).length;
  const awaiting = rows.filter((r) => r.feature.signOffStatus === "Requested").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">UAT tracker</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {pluralize(active.length, "active feature")} · {blocked} blocked · {awaiting} awaiting sign-off. <strong className="font-medium">Execution</strong> is how much has been tried; <strong className="font-medium">pass rate</strong> is how much of that passed.
          </p>
        </div>
        <NewUatButton projects={projects} />
      </div>
      <UrlFilters
        basePath="/uat"
        current={sp}
        fields={[
          { key: "q", kind: "search", placeholder: "Search features…" },
          { key: "status", kind: "select", label: "All statuses", options: UAT_STATUSES.map((s) => ({ value: s, label: s })) },
          { key: "project", kind: "select", label: "All projects", options: [{ value: "none", label: "No project" }, ...projects.map((p) => ({ value: p.id, label: p.name }))] },
        ]}
      />
      {rows.length === 0 ? (
        <Card><EmptyState icon={<FlaskConical />} title={sp.q || sp.status || sp.project ? "No UAT features match" : "No UAT features yet"} description="Create a feature, add test cases or import them from CSV, and TaskPilot tracks execution, pass rate and what to do next." action={sp.q || sp.status || sp.project ? undefined : <NewUatButton projects={projects} />} /></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map(({ feature: f, counts, metrics, actions }) => {
            const days = f.targetDate ? daysFromToday(f.targetDate) : null;
            return (
              <Link key={f.id} href={`/uat/${f.id}`} className="group">
                <Card className="flex h-full flex-col gap-3 p-4 transition-colors group-hover:border-primary/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-medium leading-snug">{f.name}</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">{[f.project?.name, f.releaseVersion, f.environment].filter(Boolean).join(" · ") || "No project"}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1"><UatStatusPill value={f.status} /><SignOffPill value={f.signOffStatus} /></div>
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between text-xs text-muted-foreground"><span>Execution {metrics.executionProgress}%</span><span>Pass rate {metrics.passRate === null ? "n/a" : `${metrics.passRate}%`}</span></div>
                    <Progress value={metrics.executionProgress} className="mt-1.5" tone={counts.failed > 0 ? "danger" : undefined} />
                  </div>
                  <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{counts.total} total</span><span className="text-emerald-600 dark:text-emerald-400">{counts.passed} passed</span>
                    <span className={cn(counts.failed && "text-red-600 dark:text-red-400")}>{counts.failed} failed</span><span>{counts.blocked} blocked</span><span>{counts.notRun} not run</span>
                    {f.targetDate && <span className={cn(days !== null && days < 0 && f.status !== "Completed" && "font-medium text-red-600 dark:text-red-400")}>Target {formatDate(f.targetDate)}</span>}
                  </p>
                  {actions[0] && <p className="mt-auto rounded-lg bg-primary-soft px-3 py-2 text-[13px]">{actions[0].text}</p>}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
