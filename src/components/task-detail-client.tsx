"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Copy, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form-controls";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TaskFormDialog } from "@/components/task-form-dialog";
import {
  addComment, addSubtask, completeTask, deleteComment, deleteSubtask, deleteTask, duplicateTask,
  reopenTask, setTaskProgress, toggleSubtask,
} from "@/actions/tasks";
import { formatDateTime } from "@/lib/dates";
import type { TaskRow } from "@/lib/queries";
import type { ActionResult } from "@/lib/validators";
import { cn } from "@/lib/utils";

function useRun() {
  const [pending, startTransition] = useTransition();
  function run(fn: () => Promise<ActionResult<unknown>>, opts?: { success?: string; after?: () => void }) {
    startTransition(async () => {
      try {
        const r = await fn();
        if (!r.ok) toast.error(r.error);
        else {
          if (opts?.success) toast.success(opts.success);
          opts?.after?.();
        }
      } catch {
        toast.error("Could not reach the local server. Is `npm run dev` still running?");
      }
    });
  }
  return { pending, run };
}

export function TaskDetailActions({ task, projects }: { task: TaskRow; projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { pending, run } = useRun();
  const done = task.status === "Done";

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant={done ? "outline" : "default"} disabled={pending} onClick={() => run(() => (done ? reopenTask(task.id) : completeTask(task.id)), { success: done ? "Task reopened" : "Task completed" })}>
        {done ? <RotateCcw /> : <CheckCircle2 />}
        {done ? "Reopen" : "Mark as done"}
      </Button>
      <Button variant="outline" onClick={() => setEditing(true)}>
        <Pencil /> Edit
      </Button>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          run(() => duplicateTask(task.id), { success: "Task duplicated" })
        }
      >
        <Copy /> Duplicate
      </Button>
      <Button variant="outline" onClick={() => setConfirm(true)}>
        <Trash2 /> Delete
      </Button>
      <TaskFormDialog open={editing} onOpenChange={setEditing} projects={projects} task={task} />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this task?"
        description="The task and its subtasks and comments will be permanently removed. This cannot be undone."
        pending={pending}
        onConfirm={() => run(() => deleteTask(task.id), { success: "Task deleted", after: () => router.push("/tasks") })}
      />
    </div>
  );
}

export function ProgressControl({ taskId, value, disabled }: { taskId: string; value: number; disabled?: boolean }) {
  const [local, setLocal] = useState(value);
  const [synced, setSynced] = useState(value);
  const { pending, run } = useRun();
  if (value !== synced) {
    setSynced(value);
    setLocal(value);
  }
  const commit = () => {
    if (local !== value) run(() => setTaskProgress(taskId, local));
  };
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Progress</span>
        <span className="tabular-nums">{local}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={local}
        disabled={disabled || pending}
        aria-label="Progress"
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="mt-1.5 w-full accent-[var(--primary)]"
      />
    </div>
  );
}

export function SubtaskList({
  taskId,
  subtasks,
}: {
  taskId: string;
  subtasks: { id: string; title: string; done: boolean }[];
}) {
  const [title, setTitle] = useState("");
  const { pending, run } = useRun();
  const doneCount = subtasks.filter((s) => s.done).length;

  return (
    <div>
      <p className="mb-2 text-[13px] font-medium">
        Subtasks {subtasks.length > 0 && <span className="font-normal text-muted-foreground">({doneCount}/{subtasks.length})</span>}
      </p>
      <ul className="space-y-1">
        {subtasks.map((s) => (
          <li key={s.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/60">
            <input
              type="checkbox"
              checked={s.done}
              aria-label={s.title}
              disabled={pending}
              onChange={(e) => run(() => toggleSubtask(s.id, e.target.checked))}
            />
            <span className={cn("flex-1 text-sm", s.done && "text-muted-foreground line-through")}>{s.title}</span>
            <button
              aria-label={`Delete subtask ${s.title}`}
              className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => run(() => deleteSubtask(s.id))}
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          run(() => addSubtask(taskId, title), { after: () => setTitle("") });
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a subtask and press Enter" aria-label="New subtask" />
        <Button type="submit" variant="outline" disabled={pending || !title.trim()}>
          Add
        </Button>
      </form>
    </div>
  );
}

export function CommentSection({
  taskId,
  comments,
}: {
  taskId: string;
  comments: { id: string; body: string; createdAt: Date }[];
}) {
  const [body, setBody] = useState("");
  const { pending, run } = useRun();
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium">Comments</p>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          run(() => addComment(taskId, body), { after: () => setBody("") });
        }}
      >
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment or progress note…" aria-label="New comment" />
        <Button type="submit" variant="outline" size="sm" disabled={pending || !body.trim()}>
          Add comment
        </Button>
      </form>
      <ul className="mt-4 space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="group rounded-lg bg-muted/60 px-3 py-2.5">
            <p className="whitespace-pre-wrap text-sm">{c.body}</p>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <time dateTime={c.createdAt.toISOString()}>{formatDateTime(c.createdAt)}</time>
              <button className="hover:text-destructive" onClick={() => run(() => deleteComment(c.id))}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
