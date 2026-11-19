import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { AnalyticsCharts } from "@/components/analytics-charts";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/form-controls";
import { getAnalytics } from "@/lib/analytics-data";
import { formatDate, parseDateKey } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };
const PRESETS = [["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["year", "This year"], ["all", "All time"]] as const;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const data = await getAnalytics(sp);
  const s = data.summary;
  const b = data.blockers;
  const cards = [
    { label: "Tasks created", value: s.totalCreated, hint: "in this period" },
    { label: "Tasks completed", value: s.totalCompleted, hint: "in this period" },
    { label: "Completion rate", value: s.completionRate === null ? "n/a" : `${s.completionRate}%`, hint: "of tasks created in the period" },
    { label: "Overdue now", value: s.overdue, hint: `${s.open} open in total` },
    { label: "Avg completion time", value: s.avgCompletionDays === null ? "n/a" : `${s.avgCompletionDays} d`, hint: "creation to done" },
    { label: "Avg blocker duration", value: b.avgDays === null ? "n/a" : `${b.avgDays} d`, hint: `${b.resolvedCount} resolved, ${b.ongoingCount} ongoing` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatDate(parseDateKey(data.range.from))} to {formatDate(parseDateKey(data.range.to))}. Every figure is calculated from your database.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-input bg-card p-0.5" role="group" aria-label="Date range">
            {PRESETS.map(([key, label]) => (
              <Link key={key} href={`/analytics?range=${key}`} aria-current={data.range.range === key ? "page" : undefined} className={cn("rounded-md px-3 py-1 text-[13px]", data.range.range === key ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>{label}</Link>
            ))}
          </div>
          <form className="flex items-center gap-1.5" action="/analytics">
            <Input type="date" name="from" defaultValue={data.range.from} aria-label="From" className="h-8 w-36" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" name="to" defaultValue={data.range.to} aria-label="To" className="h-8 w-36" />
            <Button type="submit" size="sm" variant="outline">Apply</Button>
          </form>
        </div>
      </div>

      {data.totalTasks === 0 ? (
        <Card><EmptyState icon={<BarChart3 />} title="No data to analyse yet" description="Create and complete a few tasks and your trends, distributions and productivity charts will appear here." /></Card>
      ) : (
        <>
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {cards.map((c) => (
              <Card key={c.label} className="p-4">
                <p className="text-[13px] text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{c.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
              </Card>
            ))}
          </section>
          <AnalyticsCharts data={data} />
          <p className="text-xs text-muted-foreground">
            Definitions: completion rate counts tasks created in the period that are now done (cancelled excluded). Distributions cover tasks created in the period. Blocker duration is the time between &ldquo;blocker added&rdquo; and &ldquo;blocker resolved&rdquo; in the activity log.
            {b.ongoingCount > 0 && ` ${b.ongoingCount} blocker${b.ongoingCount === 1 ? " is" : "s are"} still open (longest ${b.longestOngoingDays} days).`}
          </p>
        </>
      )}
    </div>
  );
}
