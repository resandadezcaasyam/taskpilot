"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CalendarArrowDown, GripVertical, NotebookPen, Plus, Timer, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, SectionHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { Progress } from "@/components/ui/misc";
import { DueText, KindBadge, PriorityBadge } from "@/components/badges";
import {
  addToPlan, carryToToday, dropPlanItem, moveToTomorrow, recordWork, removeFromPlan, reorderPlan, saveDailyNote, setPlanDone,
} from "@/actions/planner";
import { taskCode } from "@/lib/constants";
import type { Recommendation } from "@/lib/engine";
import type { PlannerSections } from "@/lib/planner";
import { cn, formatMinutes } from "@/lib/utils";
import type { ActionResult } from "@/lib/validators";

export interface PlanEntry {
  itemId: string;
  status: string;
  workedMinutes: number;
  task: { id: string; seq: number; title: string; status: string; priority: string; progress: number; dueDate: Date | null };
  rec: { kind: string; action: string; minutes: number } | null;
}
export interface CarriedEntry { itemId: string; date: string; task: { id: string; seq: number; title: string; priority: string } }

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>, ok?: string) =>
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) toast.error(r.error);
        else if (ok) toast.success(ok);
      } catch {
        toast.error("Could not reach the local server. Is `npm run dev` still running?");
      }
    });
  return { pending, run };
}

export function PlannerBoard(props: {
  today: string;
  entries: PlanEntry[];
  carried: CarriedEntry[];
  sections: PlannerSections;
  inPlan: string[];
  note: string;
  stats: { total: number; done: number; remainingMinutes: number; capacityMinutes: number };
  postponedCount: number;
}) {
  const { stats } = props;
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const over = stats.remainingMinutes > stats.capacityMinutes;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <PlanList entries={props.entries} />
        <SectionCard title="Must do today" hint="Due today, overdue or critical" recs={props.sections.mustDo} inPlan={props.inPlan} empty="Nothing urgent. Good." />
        <SectionCard title="Follow up today" hint="Blocked, stale or due-for-follow-up tasks" recs={props.sections.followUps} inPlan={props.inPlan} empty="No follow-ups needed right now." />
        <SectionCard title="Recommended focus" hint="Highest-impact work from the Next Action Engine" recs={props.sections.focus} inPlan={props.inPlan} empty="No other high-impact work." />
        <SectionCard title="Quick wins" hint="Small tasks you can finish fast" recs={props.sections.quickWins} inPlan={props.inPlan} empty="Add effort estimates to tasks to surface quick wins." />
        <SectionCard title="Upcoming" hint="Prepare these before their deadlines (next 7 days)" recs={props.sections.upcoming} inPlan={props.inPlan} empty="No deadlines in the next week." />
      </div>
      <div className="space-y-5">
        <Card className="space-y-4 p-5">
          <div>
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">Today&apos;s progress</p>
              <p className="text-sm tabular-nums text-muted-foreground">{stats.done}/{stats.total} done</p>
            </div>
            <Progress value={pct} tone={pct === 100 && stats.total > 0 ? "success" : undefined} className="mt-2 h-2" />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">Estimated workload</p>
              <p className={cn("text-sm tabular-nums", over ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                {formatMinutes(stats.remainingMinutes) ?? "0m"} of {formatMinutes(stats.capacityMinutes)}
              </p>
            </div>
            <Progress value={Math.min(100, (stats.remainingMinutes / Math.max(1, stats.capacityMinutes)) * 100)} tone={over ? "danger" : undefined} className="mt-2 h-2" />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {over ? "More planned than a normal workday. Consider moving something to tomorrow." : "Remaining planned work. Tasks without an estimate count as 30m."}
            </p>
          </div>
          {props.postponedCount > 0 && <p className="text-xs text-muted-foreground">{props.postponedCount} postponed {props.postponedCount === 1 ? "task is" : "tasks are"} hidden until their date.</p>}
        </Card>
        <DailyNote date={props.today} initial={props.note} />
        {props.carried.length > 0 && <Carried items={props.carried} />}
      </div>
    </div>
  );
}

function PlanList({ entries }: { entries: PlanEntry[] }) {
  const [order, setOrder] = useState(entries);
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [logging, setLogging] = useState<PlanEntry | null>(null);
  const { pending, run } = useRun();
  useEffect(() => setOrder(entries), [entries]);

  const commit = (next: PlanEntry[]) => {
    setOrder(next);
    run(() => reorderPlan(next.map((e) => e.itemId)));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const onDrop = (targetId: string) => {
    const from = dragId.current;
    dragId.current = null;
    setOverId(null);
    if (!from || from === targetId) return;
    const next = [...order];
    const a = next.findIndex((e) => e.itemId === from);
    const b = next.findIndex((e) => e.itemId === targetId);
    const [item] = next.splice(a, 1);
    next.splice(b, 0, item);
    commit(next);
  };

  return (
    <Card className="border-primary/25">
      <SectionHeader title="My plan for today" description="Drag to reorder, or use the arrows. Ticking an item marks today's work as done, not the task." />
      {order.length === 0 ? (
        <EmptyState icon={<NotebookPen />} title="Your plan is empty" description="Add tasks from the suggestions below to decide what you will work on today." />
      ) : (
        <ol>
          {order.map((e, i) => (
            <li
              key={e.itemId}
              draggable
              onDragStart={() => (dragId.current = e.itemId)}
              onDragOver={(ev) => { ev.preventDefault(); setOverId(e.itemId); }}
              onDragLeave={() => setOverId(null)}
              onDrop={() => onDrop(e.itemId)}
              className={cn("flex items-start gap-3 border-t border-border px-4 py-3.5", overId === e.itemId && "bg-primary-soft/60")}
            >
              <GripVertical className="mt-1 size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
              <input type="checkbox" className="mt-1.5" aria-label={`Mark today's work on ${e.task.title} as done`} checked={e.status === "Done"} disabled={pending} onChange={(ev) => run(() => setPlanDone(e.itemId, ev.target.checked))} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link href={`/tasks/${e.task.id}`} className={cn("font-medium hover:text-primary", e.status === "Done" && "text-muted-foreground line-through")}>{e.task.title}</Link>
                  {e.rec && <KindBadge kind={e.rec.kind} />}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono">{taskCode(e.task.seq)}</span>
                  <PriorityBadge priority={e.task.priority} />
                  <DueText date={e.task.dueDate} status={e.task.status} />
                  <span>{e.task.progress}% complete</span>
                  {e.rec && <span>~{formatMinutes(e.rec.minutes)} left</span>}
                  {e.workedMinutes > 0 && <span>{formatMinutes(e.workedMinutes)} worked today</span>}
                </div>
                {e.rec && e.status !== "Done" && <p className="text-[13px] text-muted-foreground">{e.rec.action}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button size="icon" variant="ghost" aria-label="Move up" disabled={i === 0 || pending} onClick={() => move(i, -1)}><ArrowUp /></Button>
                <Button size="icon" variant="ghost" aria-label="Move down" disabled={i === order.length - 1 || pending} onClick={() => move(i, 1)}><ArrowDown /></Button>
                <Button size="icon" variant="ghost" aria-label="Log work" title="Log work and progress" onClick={() => setLogging(e)}><Timer /></Button>
                <Button size="icon" variant="ghost" aria-label="Move to tomorrow" title="Reschedule to tomorrow" disabled={pending} onClick={() => run(() => moveToTomorrow(e.itemId), "Moved to tomorrow")}><CalendarArrowDown /></Button>
                <Button size="icon" variant="ghost" aria-label="Remove from plan" disabled={pending} onClick={() => run(() => removeFromPlan(e.itemId))}><X /></Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <WorkDialog entry={logging} onClose={() => setLogging(null)} />
    </Card>
  );
}

function WorkDialog({ entry, onClose }: { entry: PlanEntry | null; onClose: () => void }) {
  const [minutes, setMinutes] = useState("");
  const [progress, setProgress] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (entry) {
      setMinutes("");
      setProgress(String(entry.task.progress));
      setNote("");
    }
  }, [entry]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!entry) return;
    setSaving(true);
    try {
      const r = await recordWork(entry.itemId, {
        minutes: minutes ? Number(minutes) : 0,
        progress: progress === "" || Number(progress) === entry.task.progress ? null : Number(progress),
        note,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Work recorded");
      onClose();
    } catch {
      toast.error("Could not reach the local server. Is `npm run dev` still running?");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(entry)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Log work" description={entry?.task.title} className="max-w-md">
        <form onSubmit={submit}>
          <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
            <Field label="Minutes worked"><Input autoFocus inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 45" /></Field>
            <Field label="New progress (%)"><Input inputMode="numeric" value={progress} onChange={(e) => setProgress(e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Note" className="sm:col-span-2" hint="Saved as a comment on the task. Optional."><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Record work"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SectionCard({ title, hint, recs, inPlan, empty }: { title: string; hint: string; recs: Recommendation[]; inPlan: string[]; empty: string }) {
  const { pending, run } = useRun();
  const planned = new Set(inPlan);
  return (
    <Card>
      <SectionHeader title={`${title} (${recs.length})`} description={hint} />
      {recs.length === 0 ? (
        <p className="px-5 pb-5 text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <ul>
          {recs.map((r) => (
            <li key={r.task.id} className="flex items-start gap-3 border-t border-border px-5 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link href={`/tasks/${r.task.id}`} className="text-sm font-medium hover:text-primary">{r.task.title}</Link>
                  <KindBadge kind={r.kind} />
                </div>
                <p className="text-[13px] text-muted-foreground">{r.action}</p>
                <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span>Score {r.score}</span>
                  <DueText date={r.task.dueDate} status={r.task.status} />
                  {r.durationMinutes && <span>~{formatMinutes(r.durationMinutes)}</span>}
                </p>
              </div>
              {planned.has(r.task.id) ? (
                <span className="shrink-0 pt-1 text-xs text-muted-foreground">In today&apos;s plan</span>
              ) : (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => addToPlan(r.task.id), "Added to today's plan")}>
                  <Plus /> Add to plan
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Carried({ items }: { items: CarriedEntry[] }) {
  const { pending, run } = useRun();
  return (
    <Card>
      <SectionHeader title="Carried over" description="Planned on an earlier day and not finished. Nothing is lost." />
      <ul>
        {items.map((c) => (
          <li key={c.itemId} className="border-t border-border px-5 py-3 text-sm">
            <Link href={`/tasks/${c.task.id}`} className="font-medium hover:text-primary">{c.task.title}</Link>
            <p className="text-xs text-muted-foreground">{taskCode(c.task.seq)} · planned for {c.date}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => carryToToday(c.itemId), "Added to today")}>Add to today</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => dropPlanItem(c.itemId))}>Drop</Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";
function DailyNote({ date, initial }: { date: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<SaveState>("idle");
  const last = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function flush(value: string) {
    if (value === last.current) return;
    setState("saving");
    try {
      const r = await saveDailyNote(date, value);
      if (r.ok) {
        last.current = value;
        setState("saved");
      } else setState("error");
    } catch {
      setState("error");
    }
  }
  function onChange(v: string) {
    setText(v);
    setState("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(v), 800);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <Card className="space-y-2 p-5">
      <div className="flex items-center justify-between">
        <label htmlFor="daily-note" className="text-sm font-medium">Notes for today</label>
        <span role="status" className={cn("text-xs", state === "error" ? "text-destructive" : "text-muted-foreground")}>
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Not saved" : ""}
          {state === "error" && <button className="ml-2 underline" onClick={() => flush(text)}>Retry</button>}
        </span>
      </div>
      <Textarea id="daily-note" value={text} onChange={(e) => onChange(e.target.value)} onBlur={() => { if (timer.current) clearTimeout(timer.current); flush(text); }} placeholder="Meeting notes, reminders, what to tell stakeholders…" className="min-h-[130px]" />
    </Card>
  );
}
