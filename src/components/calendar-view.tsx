"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form-controls";
import { rescheduleEvent } from "@/actions/calendar";
import { groupByDate, monthGrid, RESCHEDULABLE, shiftKey, titleFor, weekDays, type CalEvent, type CalKind, type CalView } from "@/lib/calendar";
import { cn } from "@/lib/utils";

const KINDS: Record<CalKind, { label: string; chip: string; dot: string }> = {
  "task-due": { label: "Task deadlines", chip: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200", dot: "bg-indigo-500" },
  "task-followup": { label: "Task follow-ups", chip: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200", dot: "bg-amber-500" },
  "issue-followup": { label: "Issue follow-ups", chip: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200", dot: "bg-rose-500" },
  "uat-target": { label: "UAT targets", chip: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200", dot: "bg-violet-500" },
  milestone: { label: "Milestones", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", dot: "bg-emerald-500" },
  plan: { label: "Planned work", chip: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200", dot: "bg-sky-500" },
};
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView({ events, view, dateKey, todayKey }: { events: CalEvent[]; view: CalView; dateKey: string; todayKey: string }) {
  const [items, setItems] = useState(events);
  const [hidden, setHidden] = useState<Set<CalKind>>(new Set());
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [newDate, setNewDate] = useState("");
  const [saving, setSaving] = useState(false);
  const dragId = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  useEffect(() => setItems(events), [events]);
  useEffect(() => setNewDate(selected?.date ?? ""), [selected]);

  const visible = items.filter((e) => !hidden.has(e.kind));
  const byDate = groupByDate(visible);
  const link = (v: CalView, d: string) => `/calendar?view=${v}&date=${d}`;

  async function reschedule(ev: CalEvent, date: string) {
    if (ev.date === date) return;
    const previous = items;
    setItems((cur) => cur.map((e) => (e.id === ev.id ? { ...e, date } : e)));
    try {
      const r = await rescheduleEvent(ev.kind, ev.entityId, date);
      if (!r.ok) {
        setItems(previous);
        toast.error(r.error);
      } else toast.success("Rescheduled");
    } catch {
      setItems(previous);
      toast.error("Could not reach the local server. Is `npm run dev` still running?");
    }
  }

  const chip = (e: CalEvent) => {
    const k = KINDS[e.kind];
    const canMove = RESCHEDULABLE.includes(e.kind);
    return (
      <button
        key={e.id}
        type="button"
        draggable={canMove}
        onDragStart={() => (dragId.current = e.id)}
        onClick={() => setSelected(e)}
        title={`${k.label}: ${e.title}`}
        className={cn("block w-full truncate rounded px-1.5 py-0.5 text-left text-[11.5px] font-medium", k.chip, e.done && "line-through opacity-60", e.overdue && "ring-1 ring-red-400", canMove && "cursor-grab")}
      >
        {e.title}
      </button>
    );
  };

  const dayCell = (d: string, opts: { tall?: boolean; showNumber?: boolean; muted?: boolean; limit?: number }) => {
    const list = byDate.get(d) ?? [];
    const shown = opts.limit ? list.slice(0, opts.limit) : list;
    return (
      <div
        key={d}
        onDragOver={(e) => { e.preventDefault(); setOver(d); }}
        onDragLeave={() => setOver((o) => (o === d ? null : o))}
        onDrop={() => {
          setOver(null);
          const ev = items.find((x) => x.id === dragId.current);
          dragId.current = null;
          if (ev) void reschedule(ev, d);
        }}
        className={cn("flex min-w-0 flex-col gap-1 border-border bg-card p-1.5", opts.tall ? "min-h-[320px]" : "min-h-[104px]", opts.muted && "bg-muted/40", over === d && "bg-primary-soft", "border-b border-r")}
      >
        {opts.showNumber !== false && (
          <Link href={link("day", d)} className={cn("mb-0.5 inline-grid size-6 place-items-center self-start rounded-full text-xs tabular-nums", d === todayKey ? "bg-primary font-semibold text-primary-foreground" : opts.muted ? "text-muted-foreground" : "hover:bg-muted")}>
            {Number(d.slice(8))}
          </Link>
        )}
        {shown.map(chip)}
        {opts.limit && list.length > opts.limit && <Link href={link("day", d)} className="px-1 text-[11px] text-muted-foreground hover:text-primary">+{list.length - opts.limit} more</Link>}
      </div>
    );
  };

  const month = dateKey.slice(0, 7);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild aria-label="Previous"><Link href={link(view, shiftKey(view, dateKey, -1))}><ChevronLeft /></Link></Button>
          <Button variant="outline" size="icon" asChild aria-label="Next"><Link href={link(view, shiftKey(view, dateKey, 1))}><ChevronRight /></Link></Button>
          <Button variant="outline" asChild><Link href={link(view, todayKey)}>Today</Link></Button>
          <h2 className="ml-2 text-lg font-semibold tracking-tight">{titleFor(view, dateKey)}</h2>
        </div>
        <div className="flex rounded-lg border border-input bg-card p-0.5" role="group" aria-label="Calendar view">
          {(["month", "week", "day"] as const).map((v) => (
            <Link key={v} href={link(v, dateKey)} aria-current={view === v ? "page" : undefined} className={cn("rounded-md px-3 py-1 text-[13px] capitalize", view === v ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>{v}</Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Show or hide event types">
        {(Object.keys(KINDS) as CalKind[]).map((k) => {
          const off = hidden.has(k);
          return (
            <button key={k} type="button" aria-pressed={!off} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; })} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", off ? "border-border text-muted-foreground line-through" : "border-border bg-card")}>
              <span className={cn("size-2 rounded-full", KINDS[k].dot, off && "opacity-30")} />{KINDS[k].label}
            </button>
          );
        })}
      </div>

      {view === "month" && (
        <div className="overflow-x-auto">
          <div className="min-w-[760px] overflow-hidden rounded-xl border-l border-t border-border">
            <div className="grid grid-cols-7">{DOW.map((d) => <div key={d} className="border-b border-r border-border bg-muted/50 px-2 py-1.5 text-xs font-medium text-muted-foreground">{d}</div>)}</div>
            {monthGrid(dateKey).map((week, i) => (
              <div key={i} className="grid grid-cols-7">{week.map((d) => dayCell(d, { muted: d.slice(0, 7) !== month, limit: 3 }))}</div>
            ))}
          </div>
        </div>
      )}
      {view === "week" && (
        <div className="overflow-x-auto">
          <div className="min-w-[860px] overflow-hidden rounded-xl border-l border-t border-border">
            <div className="grid grid-cols-7">{weekDays(dateKey).map((d, i) => <div key={d} className="border-b border-r border-border bg-muted/50 px-2 py-1.5 text-xs font-medium text-muted-foreground">{DOW[i]} {Number(d.slice(8))}</div>)}</div>
            <div className="grid grid-cols-7">{weekDays(dateKey).map((d) => dayCell(d, { tall: true, showNumber: false }))}</div>
          </div>
        </div>
      )}
      {view === "day" && (
        <div className="max-w-2xl overflow-hidden rounded-xl border-l border-t border-border">
          {dayCell(dateKey, { tall: true, showNumber: false })}
          {(byDate.get(dateKey) ?? []).length === 0 && <p className="border-b border-r border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">Nothing scheduled. Drag an item from another view, or open its dialog to pick this date.</p>}
        </div>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent title={selected?.title ?? ""} description={selected ? `${KINDS[selected.kind].label}${selected.subtitle ? ` · ${selected.subtitle}` : ""}` : undefined} className="max-w-md">
          {selected && (
            <div className="space-y-4 px-6 py-5 text-sm">
              {selected.overdue && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800 dark:bg-red-950/40 dark:text-red-200">This is overdue.</p>}
              {RESCHEDULABLE.includes(selected.kind) ? (
                <label className="block space-y-1.5"><span className="text-[13px] font-medium">Date</span><Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></label>
              ) : <p>{selected.date}</p>}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">
            {selected && RESCHEDULABLE.includes(selected.kind) && (
              <Button variant="outline" disabled={saving || !newDate || newDate === selected.date} onClick={async () => { setSaving(true); await reschedule(selected, newDate); setSaving(false); setSelected(null); }}>Reschedule</Button>
            )}
            <Button asChild><Link href={selected?.href ?? "#"}>Open</Link></Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
