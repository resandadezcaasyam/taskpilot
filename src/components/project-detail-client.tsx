"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NewTaskButton } from "@/components/new-task-button";
import { ProjectFormDialog, type ProjectLike } from "@/components/project-form-dialog";
import { addMilestone, deleteMilestone, deleteProject, toggleMilestone } from "@/actions/projects";
import { formatDate } from "@/lib/dates";
import type { ActionResult } from "@/lib/validators";
import { cn } from "@/lib/utils";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>, opts?: { success?: string; after?: () => void }) =>
    start(async () => {
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
  return { pending, run };
}

export function NewProjectButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> New project</Button>
      <ProjectFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function ProjectDetailActions({
  project, projects, taskCount,
}: { project: ProjectLike; projects: { id: string; name: string }[]; taskCount: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap gap-2">
      <NewTaskButton projects={projects} defaultProjectId={project.id} label="Add task" />
      <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
      <Button variant="outline" onClick={() => setConfirm(true)}><Trash2 /> Delete</Button>
      <ProjectFormDialog open={editing} onOpenChange={setEditing} project={project} />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this project?"
        description={`"${project.name}" will be removed. Its ${taskCount} ${taskCount === 1 ? "task is" : "tasks are"} kept and become unassigned.`}
        pending={pending}
        onConfirm={() => run(() => deleteProject(project.id), { success: "Project deleted", after: () => router.push("/projects") })}
      />
    </div>
  );
}

export function MilestoneList({
  projectId, milestones,
}: { projectId: string; milestones: { id: string; title: string; dueDate: Date | null; completedAt: Date | null }[] }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const { pending, run } = useRun();
  return (
    <div className="px-5 pb-4">
      {milestones.length === 0 && <p className="pb-3 text-[13px] text-muted-foreground">No milestones yet.</p>}
      <ul className="space-y-1">
        {milestones.map((m) => (
          <li key={m.id} className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted/60">
            <input type="checkbox" aria-label={m.title} checked={Boolean(m.completedAt)} disabled={pending} onChange={(e) => run(() => toggleMilestone(m.id, e.target.checked))} />
            <span className={cn("flex-1 text-sm", m.completedAt && "text-muted-foreground line-through")}>{m.title}</span>
            <span className="text-xs text-muted-foreground">{formatDate(m.dueDate)}</span>
            <button aria-label={`Delete milestone ${m.title}`} className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100" onClick={() => run(() => deleteMilestone(m.id))}>
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          run(() => addMilestone(projectId, title, date), { after: () => { setTitle(""); setDate(""); } });
        }}
      >
        <Input className="min-w-40 flex-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a milestone" aria-label="Milestone title" />
        <Input className="w-40" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Milestone date" />
        <Button type="submit" variant="outline" disabled={pending || !title.trim()}>Add</Button>
      </form>
    </div>
  );
}
