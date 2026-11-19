"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { dismissReminder, refreshReminders, snoozeReminder } from "@/actions/reminders";
import { APP_TZ } from "@/lib/dates";
import { REMINDER_LABELS, type ReminderType } from "@/lib/reminders-calc";
import { cn } from "@/lib/utils";

export interface ReminderItem {
  id: string;
  type: string;
  message: string;
  href: string;
}

const TONE: Record<string, string> = {
  OVERDUE: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  FOLLOW_UP_DUE: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  UNRESOLVED_BLOCKER: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  DEADLINE_APPROACHING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  INACTIVE_TASK: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function RemindersList({ reminders }: { reminders: ReminderItem[] }) {
  const [pending, start] = useTransition();
  const run = (fn: () => ReturnType<typeof dismissReminder>, ok: string) =>
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) toast.error(r.error);
        else toast.success(ok);
      } catch {
        toast.error("Could not reach the local server. Is `npm run dev` still running?");
      }
    });

  if (reminders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 px-5 py-8 text-center">
        <BellOff className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">No active reminders</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">Deadlines, follow-ups, blockers and inactive tasks that need you will show up here while TaskPilot is open.</p>
      </div>
    );
  }
  return (
    <ul>
      {reminders.map((r) => (
        <li key={r.id} className="flex items-start gap-3 border-t border-border px-5 py-3 first:border-t-0">
          <div className="min-w-0 flex-1 space-y-1">
            <Badge className={TONE[r.type] ?? ""}>{REMINDER_LABELS[r.type as ReminderType] ?? r.type}</Badge>
            <p className="text-[13.5px]">
              <Link href={r.href} className="hover:text-primary">{r.message}</Link>
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" disabled={pending}>Snooze</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => run(() => snoozeReminder(r.id, "1h"), "Snoozed for 1 hour")}>1 hour</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => run(() => snoozeReminder(r.id, "tomorrow"), "Snoozed until tomorrow 09:00")}>Until tomorrow 09:00</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => run(() => snoozeReminder(r.id, "3days"), "Snoozed for 3 days")}>3 days</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="icon" variant="ghost" aria-label="Dismiss reminder" disabled={pending} onClick={() => run(() => dismissReminder(r.id), "Dismissed")}>
            <X />
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function RemindersBell({ reminders }: { reminders: ReminderItem[] }) {
  const [open, setOpen] = useState(false);
  const n = reminders.length;
  return (
    <>
      <Button variant="ghost" size="icon" aria-label={`Reminders${n ? `, ${n} active` : ""}`} onClick={() => setOpen(true)} className="relative">
        <Bell />
        {n > 0 && (
          <span className={cn("absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white")}>{n > 99 ? "99+" : n}</span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Reminders" description="Evaluated when the app starts and every minute while it is open." className="max-w-xl">
          <div className="overflow-y-auto"><RemindersList reminders={reminders} /></div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const jakartaKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** While the app is open: re-evaluates reminders every minute and refreshes the page when the Jakarta date rolls over. */
export function ReminderPoller({ renderedDate }: { renderedDate: string }) {
  const router = useRouter();
  useEffect(() => {
    const tick = async () => {
      if (jakartaKey() !== renderedDate) {
        router.refresh();
        return;
      }
      await refreshReminders();
    };
    const id = setInterval(tick, 60_000);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    tick();
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [renderedDate, router]);
  return null;
}
