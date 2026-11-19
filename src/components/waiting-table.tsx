"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { KindBadge, StatusBadge } from "@/components/badges";
import { FollowUpDialog, PromptDialog } from "@/components/prompt-dialogs";
import { changePic, rescheduleFollowUp, resumeTask, updateBlocker } from "@/actions/engine";
import { taskCode } from "@/lib/constants";
import { formatDate, formatDateTime, toInputDate } from "@/lib/dates";
import type { EngineTask, Recommendation } from "@/lib/engine";
import { cn } from "@/lib/utils";

export interface WaitingRow {
  task: EngineTask;
  rec: Recommendation;
  flags: string[];
  latest: { text: string; at: Date } | null;
  daysWaiting: number;
  project: { name: string } | null;
  assignee: string | null;
}

type Dlg = null | { type: "follow" | "blocker" | "pic" | "resched"; row: WaitingRow };

export function WaitingTable({ rows, followUpDefault }: { rows: WaitingRow[]; followUpDefault: string }) {
  const [dlg, setDlg] = useState<Dlg>(null);
  const [pending, start] = useTransition();

  const resume = (row: WaitingRow) =>
    start(async () => {
      const r = await resumeTask(row.task.id);
      if (!r.ok) toast.error(r.error);
      else toast.success(row.task.status === "Blocked" ? "Blocker resolved. Task is back in progress." : "Task resumed");
    });

  return (
    <>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                {["Task", "Blocker", "Waiting for", "Blocked since", "Days", "Follow-up", "Latest update", "Recommended next action", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const t = row.task;
                const late = row.flags.some((f) => f.startsWith("Follow-up"));
                return (
                  <tr key={t.id} className="border-b border-border align-top last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-3">
                      <Link href={`/tasks/${t.id}`} className="font-medium hover:text-primary">{t.title}</Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{taskCode(t.seq)}</span>
                        {row.project && <span>{row.project.name}</span>}
                        <StatusBadge status={t.status} />
                      </div>
                      {row.flags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {row.flags.map((f) => (
                            <Badge key={f} className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">{f}</Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="max-w-[200px] px-3 py-3 text-[13px]">{t.blockerDescription ?? "—"}</td>
                    <td className="px-3 py-3 text-[13px]">{t.waitingFor ?? row.assignee ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(t.blockedAt)}</td>
                    <td className="px-3 py-3 tabular-nums">{row.daysWaiting}</td>
                    <td className={cn("px-3 py-3 text-xs", late ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{formatDate(t.followUpDate)}</td>
                    <td className="max-w-[220px] px-3 py-3 text-xs text-muted-foreground">
                      {row.latest ? (
                        <>
                          <span className="line-clamp-2">{row.latest.text}</span>
                          <span className="mt-0.5 block">{formatDateTime(row.latest.at)}</span>
                        </>
                      ) : "—"}
                    </td>
                    <td className="max-w-[260px] px-3 py-3">
                      <KindBadge kind={row.rec.kind} />
                      <p className="mt-1.5 text-[13px]">{row.rec.action}</p>
                    </td>
                    <td className="px-3 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${t.title}`} disabled={pending}><MoreHorizontal /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => setDlg({ type: "follow", row })}>Follow up</DropdownMenuItem>
                          {t.status === "Blocked" && <DropdownMenuItem onSelect={() => setDlg({ type: "blocker", row })}>Update blocker</DropdownMenuItem>}
                          <DropdownMenuItem onSelect={() => setDlg({ type: "pic", row })}>Change PIC</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDlg({ type: "resched", row })}>Reschedule follow-up</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => resume(row)}>{t.status === "Blocked" ? "Resolve blocker" : "Resume task"}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {dlg && (
        <>
          <FollowUpDialog open={dlg.type === "follow"} onOpenChange={(o) => !o && setDlg(null)} taskId={dlg.row.task.id} taskTitle={dlg.row.task.title} defaultDate={followUpDefault} waitingFor={dlg.row.task.waitingFor} />
          <PromptDialog open={dlg.type === "blocker"} onOpenChange={(o) => !o && setDlg(null)} title="Update blocker" label="What is blocking this task?" kind="textarea" required initial={dlg.row.task.blockerDescription ?? ""} onSubmit={(v) => updateBlocker(dlg.row.task.id, v)} />
          <PromptDialog open={dlg.type === "pic"} onOpenChange={(o) => !o && setDlg(null)} title="Change PIC" description="Who is responsible for unblocking this?" label="Person or team" initial={dlg.row.task.waitingFor ?? ""} onSubmit={(v) => changePic(dlg.row.task.id, v)} />
          <PromptDialog open={dlg.type === "resched"} onOpenChange={(o) => !o && setDlg(null)} title="Reschedule follow-up" label="Follow-up date" kind="date" initial={toInputDate(dlg.row.task.followUpDate)} onSubmit={(v) => rescheduleFollowUp(dlg.row.task.id, v)} />
        </>
      )}
    </>
  );
}
