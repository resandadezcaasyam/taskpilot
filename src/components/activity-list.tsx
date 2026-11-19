import Link from "next/link";
import {
  AlertOctagon, CheckCircle2, CircleDot, FolderPlus, FolderX, MessageSquare, Pencil, PlusCircle,
  RotateCcw, ShieldCheck, Trash2, TrendingUp, CalendarClock, ListPlus, ArrowRightLeft, Flag, PhoneCall, SkipForward, Wand2, Link2, FlaskConical, Siren, ArrowUpCircle, type LucideIcon,
} from "lucide-react";
import { parseMeta } from "@/lib/activity";
import { formatDateTime } from "@/lib/dates";
import { taskCode } from "@/lib/constants";

const ICONS: Record<string, LucideIcon> = {
  TASK_CREATED: PlusCircle,
  TASK_UPDATED: Pencil,
  STATUS_CHANGED: ArrowRightLeft,
  PRIORITY_CHANGED: Flag,
  DEADLINE_CHANGED: CalendarClock,
  PROGRESS_UPDATED: TrendingUp,
  BLOCKER_ADDED: AlertOctagon,
  BLOCKER_RESOLVED: ShieldCheck,
  TASK_COMPLETED: CheckCircle2,
  TASK_REOPENED: RotateCcw,
  TASK_DELETED: Trash2,
  COMMENT_ADDED: MessageSquare,
  SUBTASK_ADDED: ListPlus,
  PROJECT_CREATED: FolderPlus,
  PROJECT_UPDATED: Pencil,
  PROJECT_DELETED: FolderX,
  FOLLOW_UP_RECORDED: PhoneCall,
  NEXT_ACTION_COMPLETED: CheckCircle2,
  NEXT_ACTION_POSTPONED: SkipForward,
  NEXT_ACTION_OVERRIDDEN: Wand2,
  DEPENDENCY_CHANGED: Link2,
  UAT_CREATED: FlaskConical,
  UAT_UPDATED: FlaskConical,
  UAT_RESULT_UPDATED: FlaskConical,
  UAT_SIGNOFF: CheckCircle2,
  ISSUE_CREATED: Siren,
  ISSUE_UPDATED: Siren,
  ISSUE_ESCALATED: ArrowUpCircle,
  ISSUE_STATUS_CHANGED: ArrowRightLeft,
  ISSUE_RESOLVED: CheckCircle2,
};

const TONES: Record<string, string> = {
  TASK_COMPLETED: "text-emerald-600",
  UAT_SIGNOFF: "text-emerald-600",
  ISSUE_RESOLVED: "text-emerald-600",
  ISSUE_ESCALATED: "text-red-500",
  BLOCKER_ADDED: "text-red-500",
  BLOCKER_RESOLVED: "text-emerald-600",
  TASK_DELETED: "text-muted-foreground",
};

export interface ActivityRow {
  id: string;
  type: string;
  message: string;
  meta: string | null;
  createdAt: Date;
  task?: { id: string; seq: number; title: string } | null;
}

export function ActivityList({ items, showTask = true }: { items: ActivityRow[]; showTask?: boolean }) {
  if (items.length === 0) {
    return <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">No activity yet. Changes you make will show up here.</p>;
  }
  return (
    <ol className="px-5 pb-4">
      {items.map((a) => {
        const Icon = ICONS[a.type] ?? CircleDot;
        const meta = parseMeta(a.meta);
        const code = a.task ? taskCode(a.task.seq) : meta.code;
        const title = a.task?.title ?? meta.title;
        return (
          <li key={a.id} className="flex gap-3 border-b border-border py-3 last:border-0">
            <Icon className={`mt-0.5 size-4 shrink-0 ${TONES[a.type] ?? "text-muted-foreground"}`} aria-hidden />
            <div className="min-w-0 flex-1 text-[13.5px]">
              {showTask && title && (
                <p className="truncate font-medium">
                  {a.task || meta.href ? (
                    <Link href={a.task ? `/tasks/${a.task.id}` : (meta.href as string)} className="hover:text-primary">
                      {code && <span className="mr-1.5 font-mono text-xs text-muted-foreground">{code}</span>}
                      {title}
                    </Link>
                  ) : (
                    <>
                      {code && <span className="mr-1.5 font-mono text-xs text-muted-foreground">{code}</span>}
                      {title}
                    </>
                  )}
                </p>
              )}
              <p className="text-muted-foreground">{a.message}</p>
            </div>
            <time dateTime={a.createdAt.toISOString()} className="shrink-0 pt-0.5 text-xs text-muted-foreground">
              {formatDateTime(a.createdAt)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
