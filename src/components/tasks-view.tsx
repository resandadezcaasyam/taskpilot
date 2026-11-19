"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2, ListChecks, Circle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Select } from "@/components/ui/form-controls";
import { Progress } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DueText, HoldIndicator, PriorityBadge } from "@/components/badges";
import { NewTaskButton } from "@/components/new-task-button";
import { TaskActionsMenu } from "@/components/task-actions-menu";
import { TaskFormDialog } from "@/components/task-form-dialog";
import {
  bulkUpdateTasks, completeTask, deleteTask, duplicateTask, reopenTask, setTaskStatus,
} from "@/actions/tasks";
import { TASK_PRIORITIES, TASK_STATUSES, taskCode } from "@/lib/constants";
import type { TaskRow } from "@/lib/queries";
import type { ActionResult } from "@/lib/validators";
import { cn } from "@/lib/utils";

interface Props {
  tasks: TaskRow[];
  projects: { id: string; name: string }[];
  view: "table" | "cards";
  filtered: boolean;
}

export function TasksView({ tasks, projects, view, filtered }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [deleting, setDeleting] = useState<TaskRow | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<ActionResult<unknown>>, success?: string, after?: () => void) {
    startTransition(async () => {
      try {
        const r = await fn();
        if (!r.ok) toast.error(r.error);
        else {
          if (success) toast.success(success);
          after?.();
        }
      } catch {
        toast.error("Could not reach the local server. Is `npm run dev` still running?");
      }
    });
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = tasks.length > 0 && selected.size === tasks.length;

  const menu = (t: TaskRow) => (
    <TaskActionsMenu
      status={t.status}
      onEdit={() => setEditing(t)}
      onDuplicate={() => run(() => duplicateTask(t.id), "Task duplicated")}
      onToggleDone={() => run(() => (t.status === "Done" ? reopenTask(t.id) : completeTask(t.id)), t.status === "Done" ? "Task reopened" : "Task completed")}
      onDelete={() => setDeleting(t)}
    />
  );

  const doneToggle = (t: TaskRow) => (
    <button
      type="button"
      aria-label={t.status === "Done" ? `Reopen ${t.title}` : `Complete ${t.title}`}
      disabled={pending}
      onClick={() => run(() => (t.status === "Done" ? reopenTask(t.id) : completeTask(t.id)))}
      className="text-muted-foreground transition-colors hover:text-emerald-600"
    >
      {t.status === "Done" ? <CheckCircle2 className="size-[18px] text-emerald-600" /> : <Circle className="size-[18px]" />}
    </button>
  );

  const statusSelect = (t: TaskRow) => (
    <Select
      aria-label={`Status of ${t.title}`}
      value={t.status}
      disabled={pending}
      onChange={(e) => run(() => setTaskStatus(t.id, e.target.value))}
      className="h-7 w-[152px] py-0 text-xs"
    >
      {TASK_STATUSES.map((s) => (
        <option key={s}>{s}</option>
      ))}
    </Select>
  );

  if (tasks.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ListChecks />}
          title={filtered ? "No tasks match these filters" : "No tasks yet"}
          description={
            filtered
              ? "Try clearing a filter or searching for something else."
              : "Add your first task and it is saved to your local database immediately."
          }
          action={filtered ? undefined : <NewTaskButton projects={projects} label="Create your first task" />}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <Select
            aria-label="Set status for selected"
            value=""
            className="h-8 w-40 text-xs"
            onChange={(e) =>
              e.target.value &&
              run(() => bulkUpdateTasks([...selected], { status: e.target.value }).then(reportBulk), undefined, () => setSelected(new Set()))
            }
          >
            <option value="">Set status…</option>
            {TASK_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <Select
            aria-label="Set priority for selected"
            value=""
            className="h-8 w-36 text-xs"
            onChange={(e) =>
              e.target.value &&
              run(() => bulkUpdateTasks([...selected], { priority: e.target.value }).then(reportBulk), undefined, () => setSelected(new Set()))
            }
          >
            <option value="">Set priority…</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
          <Button size="sm" variant="outline" onClick={() => setBulkDelete(true)}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            <X /> Clear
          </Button>
        </div>
      )}

      {view === "table" ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Select all tasks"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(tasks.map((t) => t.id)))}
                    />
                  </th>
                  <th className="px-2 py-2.5 font-medium">Task</th>
                  <th className="px-2 py-2.5 font-medium">Status</th>
                  <th className="px-2 py-2.5 font-medium">Priority</th>
                  <th className="px-2 py-2.5 font-medium">Deadline</th>
                  <th className="w-28 px-2 py-2.5 font-medium">Progress</th>
                  <th className="px-2 py-2.5 font-medium">PIC</th>
                  <th className="w-12 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className={cn("border-b border-border last:border-0 hover:bg-muted/40", selected.has(t.id) && "bg-primary-soft/60")}>
                    <td className="px-4 py-3">
                      <input type="checkbox" aria-label={`Select ${t.title}`} checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-start gap-2.5">
                        <div className="pt-0.5">{doneToggle(t)}</div>
                        <div className="min-w-0">
                          <Link href={`/tasks/${t.id}`} className={cn("font-medium hover:text-primary", t.status === "Done" && "text-muted-foreground line-through")}>
                            {t.title}
                          </Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <span className="font-mono">{taskCode(t.seq)}</span>
                            {t.project && <span>{t.project.name}</span>}
                            {t.tags.map((x) => (
                              <span key={x.tagId}>#{x.tag.name}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-1.5">
                        {statusSelect(t)}
                        <HoldIndicator status={t.status} />
                      </div>
                    </td>
                    <td className="px-2 py-3"><PriorityBadge priority={t.priority} /></td>
                    <td className="px-2 py-3"><DueText date={t.dueDate} status={t.status} /></td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2">
                        <Progress value={t.progress} className="w-14" />
                        <span className="text-xs tabular-nums text-muted-foreground">{t.progress}%</span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-xs text-muted-foreground">{t.assignee ?? "—"}</td>
                    <td className="px-2 py-3">{menu(t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tasks.map((t) => (
            <Card key={t.id} className={cn("flex flex-col gap-3 p-4", selected.has(t.id) && "ring-2 ring-primary/40")}>
              <div className="flex items-start gap-2.5">
                <input type="checkbox" className="mt-1" aria-label={`Select ${t.title}`} checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                <div className="min-w-0 flex-1">
                  <Link href={`/tasks/${t.id}`} className={cn("font-medium leading-snug hover:text-primary", t.status === "Done" && "text-muted-foreground line-through")}>
                    {t.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{taskCode(t.seq)}</span>
                    {t.project ? ` · ${t.project.name}` : ""}
                  </p>
                </div>
                {menu(t)}
              </div>
              {t.nextAction && <p className="rounded-lg bg-muted px-2.5 py-1.5 text-[13px] text-muted-foreground">Next: {t.nextAction}</p>}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {statusSelect(t)}
                <PriorityBadge priority={t.priority} />
                <DueText date={t.dueDate} status={t.status} />
              </div>
              <div className="flex items-center gap-2">
                <Progress value={t.progress} />
                <span className="text-xs tabular-nums text-muted-foreground">{t.progress}%</span>
                {doneToggle(t)}
              </div>
            </Card>
          ))}
        </div>
      )}

      <TaskFormDialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)} projects={projects} task={editing} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this task?"
        description={deleting ? `"${deleting.title}" and its subtasks and comments will be permanently removed. This cannot be undone.` : ""}
        pending={pending}
        onConfirm={() => deleting && run(() => deleteTask(deleting.id), "Task deleted", () => setDeleting(null))}
      />
      <ConfirmDialog
        open={bulkDelete}
        onOpenChange={setBulkDelete}
        title={`Delete ${selected.size} tasks?`}
        description="The selected tasks and their subtasks and comments will be permanently removed. This cannot be undone."
        pending={pending}
        onConfirm={() =>
          run(() => bulkUpdateTasks([...selected], { delete: true }).then(reportBulk), undefined, () => {
            setSelected(new Set());
            setBulkDelete(false);
          })
        }
      />
    </div>
  );
}

function reportBulk(r: ActionResult<{ changed: number; skipped: number }>): ActionResult<unknown> {
  if (r.ok) {
    const { changed, skipped } = r.data;
    if (skipped > 0) {
      toast.warning(`${changed} updated, ${skipped} skipped: Blocked and Waiting need a blocker or a "waiting for" note, so set those on the task itself.`);
    } else {
      toast.success(`${changed} ${changed === 1 ? "task" : "tasks"} updated`);
    }
  }
  return r;
}
