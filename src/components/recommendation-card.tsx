import Link from "next/link";
import { Hourglass, Lock } from "lucide-react";
import { DueText, KindBadge, PriorityBadge, StatusBadge } from "@/components/badges";
import { RecActions } from "@/components/rec-actions";
import { taskCode } from "@/lib/constants";
import { addDays, dateKey, startOfToday } from "@/lib/dates";
import type { Recommendation } from "@/lib/engine";
import { cn, formatMinutes } from "@/lib/utils";

const BAR_LABELS: [keyof Recommendation["breakdown"], string][] = [
  ["deadline", "Deadline"], ["priority", "Priority"], ["followUp", "Follow-up / blocker"], ["inactivity", "Inactivity"], ["effort", "Effort"],
];

export function RecommendationCard({ rec, followUpDays, showOrder = true, compact = false }: { rec: Recommendation; followUpDays: number; showOrder?: boolean; compact?: boolean }) {
  const t = rec.task;
  return (
    <li className="space-y-3 border-t border-border px-5 py-4 first:border-t-0">
      <div className="flex items-start gap-3">
        {showOrder && (
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold tabular-nums text-primary" title="Suggested execution order">
            {rec.order}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={`/tasks/${t.id}`} className="font-medium hover:text-primary">{t.title}</Link>
            <KindBadge kind={rec.kind} />
            {t.status === "Blocked" && <Lock className="size-3.5 text-red-500" aria-label="Blocked" />}
            {t.status === "Waiting for Others" && <Hourglass className="size-3.5 text-amber-500" aria-label="Waiting" />}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{taskCode(t.seq)}</span>
            {t.projectName && <span>{t.projectName}</span>}
            <StatusBadge status={t.status} />
            <PriorityBadge priority={t.priority} />
            <DueText date={t.dueDate} status={t.status} />
            {rec.durationMinutes && <span>~{formatMinutes(rec.durationMinutes)}</span>}
          </div>
          <p className={cn("rounded-lg px-3 py-2 text-[13.5px]", rec.source === "override" ? "bg-amber-50 dark:bg-amber-950/40" : "bg-primary-soft")}>
            {rec.action}
            {rec.source === "override" && <span className="ml-2 text-xs text-muted-foreground">(your override)</span>}
          </p>
          <p className="text-xs text-muted-foreground">Why: {rec.reason}</p>
          {!compact && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">Score breakdown</summary>
              <ul className="mt-2 grid max-w-md gap-1.5">
                {BAR_LABELS.map(([k, label]) => (
                  <li key={k} className="grid grid-cols-[130px_1fr_32px] items-center gap-2">
                    <span>{label}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${rec.breakdown[k]}%` }} /></span>
                    <span className="text-right tabular-nums">{rec.breakdown[k]}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold tabular-nums leading-none">{rec.score}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">priority score</p>
        </div>
      </div>
      <div className={showOrder ? "pl-9" : ""}>
        <RecActions
          taskId={t.id} taskTitle={t.title} status={t.status} kind={rec.kind} action={rec.action} score={rec.score} reason={rec.reason}
          waitingFor={t.waitingFor} overridden={rec.source === "override"} pinned={rec.pinned}
          followUpDefault={dateKey(addDays(startOfToday(), followUpDays))}
        />
      </div>
    </li>
  );
}
