import type { Metadata } from "next";
import { APP_TZ } from "@/lib/dates";
import { PlannerBoard } from "@/components/planner-client";
import { getPlannerData } from "@/lib/engine-data";
import { plannedMinutes } from "@/lib/planner";

export const metadata: Metadata = { title: "Today Planner" };

export default async function TodayPage() {
  const now = new Date();
  const d = await getPlannerData(now);
  const label = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, weekday: "long", day: "numeric", month: "long" }).format(now);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today planner</h1>
        <p className="mt-1 text-sm text-muted-foreground">{label}. Suggestions are recalculated from today&apos;s date. Yesterday&apos;s unfinished plan is kept under &ldquo;Carried over&rdquo;.</p>
      </div>
      <PlannerBoard
        today={d.today}
        entries={d.planned.map((p) => ({
          itemId: p.item.id,
          status: p.item.status,
          workedMinutes: p.item.workedMinutes,
          task: { id: p.task.id, seq: p.task.seq, title: p.task.title, status: p.task.status, priority: p.task.priority, progress: p.task.progress, dueDate: p.task.dueDate },
          rec: p.rec ? { kind: p.rec.kind, action: p.rec.action, minutes: plannedMinutes(p.rec) } : null,
        }))}
        carried={d.carried.map((c) => ({ itemId: c.id, date: c.date, task: { id: c.task.id, seq: c.task.seq, title: c.task.title, priority: c.task.priority } }))}
        sections={d.sections}
        inPlan={[...d.inPlan]}
        note={d.note}
        stats={d.stats}
        postponedCount={d.postponedCount}
      />
    </div>
  );
}
