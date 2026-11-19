"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Hourglass, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select } from "@/components/ui/form-controls";
import { Progress } from "@/components/ui/misc";
import { DueText, PriorityBadge, StatusBadge } from "@/components/badges";
import { PromptDialog } from "@/components/prompt-dialogs";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { moveTask } from "@/actions/tasks";
import { taskCode } from "@/lib/constants";
import { daysFromToday, formatDate } from "@/lib/dates";
import type { TaskRow } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const KANBAN_COLUMNS = [
  { status: "Backlog", label: "Backlog" },
  { status: "To Do", label: "To Do" },
  { status: "In Progress", label: "In Progress" },
  { status: "Waiting for Others", label: "Waiting" },
  { status: "Blocked", label: "Blocked" },
  { status: "In Review", label: "In Review" },
  { status: "Done", label: "Done" },
] as const;

export function KanbanBoard({ tasks, projects, doneNote }: { tasks: TaskRow[]; projects: { id: string; name: string }[]; doneNote?: string }) {
  const [items, setItems] = useState(tasks);
  const [over, setOver] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{ task: TaskRow; status: string } | null>(null);
  const [panel, setPanel] = useState<TaskRow | null>(null);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const dragId = useRef<string | null>(null);
  useEffect(() => setItems(tasks), [tasks]);

  async function move(task: TaskRow, status: string, context?: { blockerDescription?: string; waitingFor?: string }) {
    const previous = items;
    setItems((cur) => cur.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      const r = await moveTask(task.id, status, context);
      if (!r.ok) {
        setItems(previous);
        toast.error(r.error);
      }
    } catch {
      setItems(previous);
      toast.error("Could not reach the local server. Is `npm run dev` still running?");
    }
  }

  function request(task: TaskRow, status: string) {
    if (task.status === status) return;
    if (status === "Blocked" && !task.blockerDescription) return setPrompt({ task, status });
    if (status === "Waiting for Others" && !task.waitingFor) return setPrompt({ task, status });
    void move(task, status);
  }

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 pb-3 md:-mx-6 md:px-6">
        <div className="grid min-w-[1180px] grid-cols-7 gap-3">
          {KANBAN_COLUMNS.map((col) => {
            const list = items.filter((t) => t.status === col.status);
            return (
              <section
                key={col.status}
                aria-label={col.label}
                onDragOver={(e) => { e.preventDefault(); setOver(col.status); }}
                onDragLeave={() => setOver((o) => (o === col.status ? null : o))}
                onDrop={() => {
                  setOver(null);
                  const task = items.find((t) => t.id === dragId.current);
                  dragId.current = null;
                  if (task) request(task, col.status);
                }}
                className={cn("flex min-h-[420px] flex-col rounded-xl border border-border bg-muted/40 p-2 transition-colors", over === col.status && "border-primary bg-primary-soft/60")}
              >
                <header className="flex items-center justify-between px-1.5 pb-2 pt-1">
                  <h2 className="text-[13px] font-semibold">{col.label}</h2>
                  <span className="rounded-full bg-card px-2 text-xs tabular-nums text-muted-foreground">{list.length}</span>
                </header>
                <ul className="flex flex-1 flex-col gap-2">
                  {list.map((t) => {
                    const open = t.status !== "Done";
                    const overdue = open && t.dueDate && daysFromToday(t.dueDate) < 0;
                    return (
                      <li
                        key={t.id}
                        draggable
                        onDragStart={() => (dragId.current = t.id)}
                        className={cn("cursor-grab rounded-lg border bg-card p-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]", overdue ? "border-red-300 dark:border-red-900" : "border-border")}
                      >
                        <button type="button" onClick={() => setPanel(t)} className="block w-full text-left">
                          <span className={cn("text-[13.5px] font-medium leading-snug", t.status === "Done" && "text-muted-foreground line-through")}>{t.title}</span>
                        </button>
                        <p className="mt-1 text-[11px] text-muted-foreground"><span className="font-mono">{taskCode(t.seq)}</span>{t.project ? ` · ${t.project.name}` : ""}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1"><PriorityBadge priority={t.priority} /><DueText date={t.dueDate} status={t.status} /></div>
                        {t.status === "Blocked" && <p className="mt-2 flex items-start gap-1 text-xs text-red-600 dark:text-red-400"><Lock className="mt-0.5 size-3 shrink-0" /><span className="line-clamp-2">{t.blockerDescription}</span></p>}
                        {t.status === "Waiting for Others" && <p className="mt-2 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400"><Hourglass className="mt-0.5 size-3 shrink-0" /><span className="line-clamp-2">{t.waitingFor}</span></p>}
                        {open && t.progress > 0 && <Progress value={t.progress} className="mt-2" />}
                        <Select aria-label={`Move ${t.title} to`} value={t.status} onChange={(e) => request(t, e.target.value)} className="mt-2 h-7 py-0 text-[11px]">
                          {KANBAN_COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
                        </Select>
                      </li>
                    );
                  })}
                  {list.length === 0 && <li className="grid flex-1 place-items-center rounded-lg border border-dashed border-border px-2 py-8 text-center text-xs text-muted-foreground">Drop a task here</li>}
                </ul>
                {col.status === "Done" && doneNote && <p className="px-1.5 pt-2 text-[11px] text-muted-foreground">{doneNote}</p>}
              </section>
            );
          })}
        </div>
      </div>

      <PromptDialog
        open={Boolean(prompt)}
        onOpenChange={(o) => !o && setPrompt(null)}
        title={prompt?.status === "Blocked" ? "What is blocking this task?" : "Who are you waiting for?"}
        description={prompt?.task.title}
        label={prompt?.status === "Blocked" ? "Blocker" : "Waiting for"}
        kind={prompt?.status === "Blocked" ? "textarea" : "text"}
        required
        submitLabel="Move task"
        onSubmit={async (value) => {
          if (!prompt) return { ok: false as const, error: "Nothing to move" };
          return moveTask(prompt.task.id, prompt.status, prompt.status === "Blocked" ? { blockerDescription: value } : { waitingFor: value });
        }}
      />

      <Dialog open={Boolean(panel)} onOpenChange={(o) => !o && setPanel(null)}>
        <DialogContent title={panel?.title ?? ""} description={panel ? `${taskCode(panel.seq)}${panel.project ? ` · ${panel.project.name}` : ""}` : undefined} className="max-w-lg">
          {panel && (
            <div className="space-y-4 overflow-y-auto px-6 py-5 text-sm">
              <div className="flex flex-wrap items-center gap-3"><StatusBadge status={panel.status} /><PriorityBadge priority={panel.priority} /><DueText date={panel.dueDate} status={panel.status} /></div>
              <div><Progress value={panel.progress} /><p className="mt-1 text-xs text-muted-foreground">{panel.progress}% complete</p></div>
              {panel.nextAction && <p className="rounded-lg bg-primary-soft px-3 py-2">Next: {panel.nextAction}</p>}
              {panel.blockerDescription && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800 dark:bg-red-950/40 dark:text-red-200">Blocked: {panel.blockerDescription}</p>}
              {panel.waitingFor && <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Waiting for {panel.waitingFor}{panel.followUpDate ? ` · follow up ${formatDate(panel.followUpDate)}` : ""}</p>}
              {panel.description && <p className="whitespace-pre-wrap text-muted-foreground">{panel.description}</p>}
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-muted-foreground">Assignee</dt><dd>{panel.assignee ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Category</dt><dd>{panel.category}</dd></div>
              </dl>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">
            <Button variant="outline" onClick={() => { setEditing(panel); setPanel(null); }}>Edit</Button>
            <Button asChild><Link href={panel ? `/tasks/${panel.id}` : "#"}>Open full page</Link></Button>
          </div>
        </DialogContent>
      </Dialog>
      <TaskFormDialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)} projects={projects} task={editing} />
    </>
  );
}
