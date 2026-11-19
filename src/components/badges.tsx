import { AlertTriangle, CalendarClock, Hourglass, Lock } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { APP_TZ, dueLabel, daysFromToday } from "@/lib/dates";
import { CLOSED_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  Backlog: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  "To Do": "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "In Progress": "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  "Waiting for Others": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Blocked: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  "In Review": "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  Done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  Cancelled: "bg-zinc-100 text-zinc-500 line-through dark:bg-zinc-800 dark:text-zinc-400",
};

const PRIORITY_STYLES: Record<string, { dot: string; text: string }> = {
  Critical: { dot: "bg-red-500", text: "text-red-700 dark:text-red-300" },
  High: { dot: "bg-orange-500", text: "text-orange-700 dark:text-orange-300" },
  Medium: { dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-300" },
  Low: { dot: "bg-slate-400", text: "text-slate-600 dark:text-slate-400" },
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge className={STATUS_STYLES[status] ?? STATUS_STYLES.Backlog}>{status}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const s = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.Medium;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", s.text)}>
      <span className={cn("size-2 rounded-full", s.dot)} aria-hidden />
      {priority}
    </span>
  );
}

export function DueText({ date, status, className }: { date: Date | null; status: string; className?: string }) {
  if (!date) return <span className={cn("text-xs text-muted-foreground", className)}>No deadline</span>;
  const open = !(CLOSED_STATUSES as readonly string[]).includes(status);
  const d = daysFromToday(date);
  const overdue = open && d < 0;
  const soon = open && d >= 0 && d <= 1;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        overdue ? "font-medium text-red-600 dark:text-red-400" : soon ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground",
        className,
      )}
    >
      {overdue ? <AlertTriangle className="size-3" /> : <CalendarClock className="size-3" />}
      {open ? dueLabel(date) : new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, day: "2-digit", month: "short" }).format(date)}
    </span>
  );
}

export function HoldIndicator({ status }: { status: string }) {
  if (status === "Blocked") return <Lock className="size-3.5 text-red-500" aria-label="Blocked" />;
  if (status === "Waiting for Others") return <Hourglass className="size-3.5 text-amber-500" aria-label="Waiting" />;
  return null;
}

export function HealthBadge({ level, reason }: { level: string; reason: string }) {
  const style =
    level === "at-risk"
      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
      : level === "watch"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : level === "idle"
          ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  const label = level === "at-risk" ? "At risk" : level === "watch" ? "Watch" : level === "idle" ? "No tasks" : "Healthy";
  return (
    <Badge className={style} title={reason}>
      {label}
      <span className="font-normal opacity-80">· {reason}</span>
    </Badge>
  );
}

const KIND_STYLES: Record<string, string> = {
  "Do Now": "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  "Do Today": "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  "Follow Up": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "Resolve Blocker": "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  "Continue Progress": "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  Review: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  "Approaching Deadline": "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  "Quick Win": "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

export function KindBadge({ kind }: { kind: string }) {
  return <Badge className={KIND_STYLES[kind] ?? "bg-muted text-foreground"}>{kind}</Badge>;
}
