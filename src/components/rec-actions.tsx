"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowUpRight, CheckCircle2, Clock, MessageSquare, Pencil, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FollowUpDialog, OverrideDialog } from "@/components/prompt-dialogs";
import { completeNextAction, postponeNextAction, startNow } from "@/actions/engine";
import type { ActionResult } from "@/lib/validators";

export interface RecActionsProps {
  taskId: string;
  taskTitle: string;
  status: string;
  kind: string;
  action: string;
  score: number;
  reason: string;
  waitingFor?: string | null;
  overridden: boolean;
  pinned: boolean;
  /** yyyy-MM-dd suggested for the next follow-up */
  followUpDefault: string;
}

export function RecActions(p: RecActionsProps) {
  const [pending, start] = useTransition();
  const [followUp, setFollowUp] = useState(false);
  const [override, setOverride] = useState(false);

  const run = (fn: () => Promise<ActionResult<unknown>>, ok: string) =>
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) toast.error(r.error);
        else toast.success(ok);
      } catch {
        toast.error("Could not reach the local server. Is `npm run dev` still running?");
      }
    });

  const workable = p.status === "To Do" || p.status === "Backlog" || p.status === "In Progress";
  const snapshot = { kind: p.kind, text: p.action, score: p.score };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {workable && (
        <Button size="sm" disabled={pending} onClick={() => run(() => startNow(p.taskId), "Started and added to today's plan")}>
          <Play /> {p.status === "In Progress" ? "Add to today" : "Start now"}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => completeNextAction(p.taskId, { ...snapshot, reason: p.reason }), "Action marked complete. The task itself stays open.")}
      >
        <CheckCircle2 /> Mark action complete
      </Button>
      <Button size="sm" variant="outline" onClick={() => setFollowUp(true)}>
        <MessageSquare /> Follow up
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={pending}>
            <Clock /> Postpone
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {([["tomorrow", "Until tomorrow"], ["3days", "For 3 days"], ["nextweek", "For a week"]] as const).map(([opt, label]) => (
            <DropdownMenuItem key={opt} onSelect={() => run(() => postponeNextAction(p.taskId, opt, snapshot), "Postponed. It will return automatically.")}>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="ghost" onClick={() => setOverride(true)} aria-label="Override recommendation">
        <Pencil /> Override
      </Button>
      <Button size="sm" variant="ghost" asChild>
        <Link href={`/tasks/${p.taskId}`}>
          View task <ArrowUpRight />
        </Link>
      </Button>
      <FollowUpDialog open={followUp} onOpenChange={setFollowUp} taskId={p.taskId} taskTitle={p.taskTitle} defaultDate={p.followUpDefault} waitingFor={p.waitingFor} />
      <OverrideDialog open={override} onOpenChange={setOverride} taskId={p.taskId} currentText={p.overridden ? p.action : ""} pinned={p.pinned} overridden={p.overridden} />
    </div>
  );
}
