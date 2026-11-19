"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { createTask, updateTask } from "@/actions/tasks";
import { parseQuickCapture } from "@/lib/quick-parse";
import { TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { EMPTY_TASK_FORM, taskToFormValues } from "@/lib/task-form";
import { taskFormSchema, type TaskFormValues } from "@/lib/validators";
import type { TaskRow } from "@/lib/queries";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: { id: string; name: string }[];
  task?: TaskRow | null;
  /** "quick" shows only the essentials for fast capture. */
  variant?: "quick" | "full";
  defaultProjectId?: string;
}

export function TaskFormDialog({ open, onOpenChange, projects, task, variant = "full", defaultProjectId }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [capture, setCapture] = useState("");
  const [detected, setDetected] = useState<string[]>([]);
  const editing = Boolean(task);
  const quick = variant === "quick" && !editing;

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: EMPTY_TASK_FORM,
  });
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const status = watch("status");

  useEffect(() => {
    if (open) {
      setCapture("");
      setDetected([]);
      setMoreOpen(Boolean(task));
      reset(task ? taskToFormValues(task) : { ...EMPTY_TASK_FORM, projectId: defaultProjectId ?? "" });
    }
  }, [open, task, defaultProjectId, reset]);

  /** Rule-based Quick Capture: works offline, no AI needed. */
  function fillFromSentence() {
    const r = parseQuickCapture(capture, new Date());
    if (!r.title) return;
    setValue("title", r.title, { shouldValidate: true });
    if (r.category) setValue("category", r.category as TaskFormValues["category"]);
    if (r.priority) setValue("priority", r.priority as TaskFormValues["priority"]);
    setValue("dueDate", r.dueDate ?? "");
    setValue("followUpDate", r.followUpDate ?? "");
    if (r.nextAction) setValue("nextAction", r.nextAction);
    if (r.tags.length) setValue("tags", r.tags.join(", "));
    setDetected(r.detected);
  }

  async function onSubmit(values: TaskFormValues) {
    setSaving(true);
    try {
      const res = task ? await updateTask(task.id, values) : await createTask(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onOpenChange(false);
      if (task) {
        toast.success("Task saved");
      } else {
        const id = (res as { data: { id: string } }).data.id;
        toast.success("Task created", { action: { label: "Open", onClick: () => router.push(`/tasks/${id}`) } });
      }
    } catch {
      toast.error("Could not reach the local server. Is `npm run dev` still running?");
    } finally {
      setSaving(false);
    }
  }

  const err = (k: keyof TaskFormValues) => errors[k]?.message as string | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? "Edit task" : quick ? "Quick add task" : "New task"}
        description={quick ? "Capture it now, refine it later." : undefined}
      >
        <form onSubmit={handleSubmit(onSubmit, () => setMoreOpen(true))} className="flex min-h-0 flex-1 flex-col">
          <div className="grid gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
            {quick && (
              <div className="space-y-2 rounded-lg bg-primary-soft/60 p-3 sm:col-span-2">
                <label htmlFor="capture" className="block text-[13px] font-medium">Describe it in one sentence</label>
                <div className="flex gap-2">
                  <Input
                    id="capture"
                    autoFocus
                    value={capture}
                    onChange={(e) => setCapture(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        fillFromSentence();
                      }
                    }}
                    placeholder="e.g. Follow up with engineering about the API issue tomorrow"
                  />
                  <Button type="button" variant="outline" onClick={fillFromSentence} disabled={!capture.trim()}>Fill form</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Adding several at once? <Link href="/capture" onClick={() => onOpenChange(false)} className="font-medium text-primary hover:underline">Open Brain Dump</Link>.{" "}
                  {detected.length ? `Detected: ${detected.join(" · ")}. Check the fields below.` : "Dates (tomorrow, next Friday, 25 Nov, besok), priority and type are picked up automatically. Press Enter."}
                </p>
              </div>
            )}
            <Field label="Title" error={err("title")} className="sm:col-span-2">
              <Input autoFocus={!quick} placeholder="Task title" {...register("title")} />
            </Field>

            <Field label="Project" error={err("projectId")}>
              <Select {...register("projectId")}>
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category" error={err("category")}>
              <Select {...register("category")}>
                {TASK_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" error={err("priority")}>
              <Select {...register("priority")}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </Field>
            {!quick && (
              <Field label="Status" error={err("status")}>
                <Select {...register("status")}>
                  {TASK_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
            )}

            <Field label="Due date" error={err("dueDate")}>
              <Input type="date" {...register("dueDate")} />
            </Field>
            <Field label="Follow-up date" error={err("followUpDate")}>
              <Input type="date" {...register("followUpDate")} />
            </Field>
            <Field label="Next action" error={err("nextAction")} className="sm:col-span-2" hint="The very next step, in one sentence.">
              <Input placeholder="e.g. Ask for an estimated fix date" {...register("nextAction")} />
            </Field>

            {status === "Blocked" && !quick && (
              <Field label="What is blocking this?" error={err("blockerDescription")} className="sm:col-span-2">
                <Textarea placeholder="e.g. Backend timestamp not generated" {...register("blockerDescription")} />
              </Field>
            )}
            {status === "Waiting for Others" && !quick && (
              <Field label="Waiting for" error={err("waitingFor")} className="sm:col-span-2">
                <Input placeholder="Person or team" {...register("waitingFor")} />
              </Field>
            )}

            {!quick && (
              <details
                open={moreOpen}
                onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}
                className="rounded-lg border border-border px-4 py-3 sm:col-span-2"
              >
                <summary className="cursor-pointer select-none text-[13px] font-medium">More details (all optional)</summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Description" error={err("description")} className="sm:col-span-2">
                  <Textarea {...register("description")} />
                </Field>
                <Field label="Start date" error={err("startDate")}>
                  <Input type="date" {...register("startDate")} />
                </Field>
                <Field label="Next action deadline" error={err("nextActionDue")}>
                  <Input type="date" {...register("nextActionDue")} />
                </Field>
                <Field label="Assignee / PIC" error={err("assignee")}>
                  <Input {...register("assignee")} />
                </Field>
                <Field label="Stakeholder" error={err("stakeholder")}>
                  <Input {...register("stakeholder")} />
                </Field>
                <Field label="Estimated effort (hours)" error={err("estimatedHours")}>
                  <Input inputMode="decimal" placeholder="e.g. 1.5" {...register("estimatedHours")} />
                </Field>
                <Field label="Actual effort (hours)" error={err("actualHours")}>
                  <Input inputMode="decimal" {...register("actualHours")} />
                </Field>
                <Field label="Progress (%)" error={err("progress")}>
                  <Input inputMode="numeric" {...register("progress")} />
                </Field>
                <Field label="Business importance (1-5)" error={err("businessImportance")}>
                  <Select {...register("businessImportance")}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Tags" error={err("tags")} className="sm:col-span-2" hint="Separate with commas.">
                  <Input placeholder="uat, booking, vendor" {...register("tags")} />
                </Field>
                <Field label="Notes" error={err("notes")} className="sm:col-span-2">
                  <Textarea {...register("notes")} />
                </Field>
                </div>
              </details>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3.5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
