import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Settings2 } from "lucide-react";
import { BringBackButton } from "@/components/postponed-row";
import { RecommendationCard } from "@/components/recommendation-card";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, SectionHeader } from "@/components/ui/card";
import { getEngineState } from "@/lib/engine-data";
import { getIssueActions } from "@/lib/issue-data";
import { issueCode } from "@/lib/issues";
import { getUatActions } from "@/lib/uat-data";
import { IssueStatusPill, UatStatusPill } from "@/components/pills";
import { REC_KINDS } from "@/lib/engine";
import { formatDate, formatDateTime } from "@/lib/dates";
import { taskCode } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Next Actions" };

export default async function NextActionsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const now = new Date();
  const [state, uatActions, issueActions] = await Promise.all([getEngineState(now), getUatActions(now), getIssueActions(now)]);
  const active = (REC_KINDS as readonly string[]).includes(kind ?? "") ? kind : undefined;
  const shown = active ? state.recommendations.filter((r) => r.kind === active) : state.recommendations;
  const counts = new Map<string, number>();
  for (const r of state.recommendations) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Next actions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ranked by a 0-100 score from deadline, priority, follow-up/blocker urgency, inactivity and effort. Recalculated {formatDateTime(now)} (Jakarta) and every time your data changes.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/settings"><Settings2 /> Scoring settings</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by recommendation type">
        <Link href="/next-actions" className={cn("rounded-full border px-3 py-1 text-xs font-medium", !active ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
          All ({state.recommendations.length})
        </Link>
        {REC_KINDS.filter((k) => counts.get(k)).map((k) => (
          <Link key={k} href={`/next-actions?kind=${encodeURIComponent(k)}`} className={cn("rounded-full border px-3 py-1 text-xs font-medium", active === k ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            {k} ({counts.get(k)})
          </Link>
        ))}
      </div>

      <Card>
        {shown.length === 0 ? (
          <EmptyState
            icon={<Compass />}
            title={state.recommendations.length === 0 ? "No open tasks to recommend" : "No recommendations of this type"}
            description={state.recommendations.length === 0 ? "Create a task or bring back a postponed one and it will be ranked here." : "Pick another type above."}
          />
        ) : (
          <ol>
            {shown.map((rec) => (
              <RecommendationCard key={rec.task.id} rec={rec} followUpDays={state.settings.followUpSnoozeDays} />
            ))}
          </ol>
        )}
      </Card>

      {uatActions.length > 0 && (
        <Card>
          <SectionHeader title="UAT actions" description="One next step per UAT feature, most urgent first." action={<Link href="/uat" className="text-[13px] text-primary hover:underline">UAT tracker</Link>} />
          <ul>
            {uatActions.slice(0, 6).map(({ feature: f, action }) => (
              <li key={f.id} className="flex items-start justify-between gap-3 border-t border-border px-5 py-3 text-sm">
                <div className="min-w-0"><Link href={`/uat/${f.id}`} className="font-medium hover:text-primary">{f.name}</Link><p className="mt-0.5 text-[13px] text-muted-foreground">{action.text}</p></div>
                <UatStatusPill value={f.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {issueActions.length > 0 && (
        <Card>
          <SectionHeader title="Issue actions" description="Open issues that need something from you." action={<Link href="/issues" className="text-[13px] text-primary hover:underline">Issues</Link>} />
          <ul>
            {issueActions.slice(0, 6).map(({ issue: i, action }) => (
              <li key={i.id} className="flex items-start justify-between gap-3 border-t border-border px-5 py-3 text-sm">
                <div className="min-w-0"><Link href={`/issues/${i.id}`} className="font-medium hover:text-primary"><span className="mr-1.5 font-mono text-xs text-muted-foreground">{issueCode(i.seq)}</span>{i.title}</Link><p className="mt-0.5 text-[13px] text-muted-foreground">{action.text}</p></div>
                <IssueStatusPill value={i.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {state.postponed.length > 0 && (
        <Card>
          <SectionHeader title="Postponed" description="Hidden until the date shown; they return automatically." />
          <ul>
            {state.postponed.map((p) => (
              <li key={p.task.id} className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/tasks/${p.task.id}`} className="block truncate font-medium hover:text-primary">{p.task.title}</Link>
                  <p className="text-xs text-muted-foreground">{taskCode(p.task.seq)} · back on {formatDate(p.until)}</p>
                </div>
                <BringBackButton taskId={p.task.id} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {state.completed.length > 0 && (
        <Card>
          <SectionHeader title="Recently completed actions" description="Completing an action never completes the task." />
          <ul>
            {state.completed.map((c) => (
              <li key={c.id} className="border-t border-border px-5 py-3 text-sm">
                <p>{c.text}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <Link href={`/tasks/${c.task.id}`} className="hover:text-primary">{taskCode(c.task.seq)} {c.task.title}</Link>
                  {c.completedAt ? ` · ${formatDateTime(c.completedAt)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
