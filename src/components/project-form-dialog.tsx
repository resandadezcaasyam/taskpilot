"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { createProject, updateProject } from "@/actions/projects";
import { PROJECT_STATUSES, TASK_PRIORITIES } from "@/lib/constants";
import { toInputDate } from "@/lib/dates";
import { projectFormSchema, type ProjectFormValues } from "@/lib/validators";

export interface ProjectLike {
  id: string;
  name: string;
  description: string | null;
  owner: string | null;
  category: string | null;
  priority: string;
  status: string;
  startDate: Date | null;
  targetDate: Date | null;
  risks: string | null;
  notes: string | null;
}

const EMPTY: ProjectFormValues = {
  name: "", description: "", owner: "", category: "", priority: "Medium", status: "Active",
  startDate: "", targetDate: "", risks: "", notes: "",
};

const toForm = (p: ProjectLike): ProjectFormValues => ({
  name: p.name,
  description: p.description ?? "",
  owner: p.owner ?? "",
  category: p.category ?? "",
  priority: p.priority as ProjectFormValues["priority"],
  status: p.status as ProjectFormValues["status"],
  startDate: toInputDate(p.startDate),
  targetDate: toInputDate(p.targetDate),
  risks: p.risks ?? "",
  notes: p.notes ?? "",
});

export function ProjectFormDialog({
  open, onOpenChange, project,
}: { open: boolean; onOpenChange: (o: boolean) => void; project?: ProjectLike | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const {
    register, handleSubmit, reset, formState: { errors },
  } = useForm<ProjectFormValues>({ resolver: zodResolver(projectFormSchema), defaultValues: EMPTY });

  useEffect(() => {
    if (open) reset(project ? toForm(project) : EMPTY);
  }, [open, project, reset]);

  async function onSubmit(values: ProjectFormValues) {
    setSaving(true);
    try {
      const res = project ? await updateProject(project.id, values) : await createProject(values);
      if (!res.ok) return void toast.error(res.error);
      onOpenChange(false);
      toast.success(project ? "Project saved" : "Project created");
      if (!project) router.push(`/projects/${(res as { data: { id: string } }).data.id}`);
    } catch {
      toast.error("Could not reach the local server. Is `npm run dev` still running?");
    } finally {
      setSaving(false);
    }
  }
  const err = (k: keyof ProjectFormValues) => errors[k]?.message as string | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={project ? "Edit project" : "New project"}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="grid gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
            <Field label="Project name" error={err("name")} className="sm:col-span-2">
              <Input autoFocus {...register("name")} />
            </Field>
            <Field label="Description" error={err("description")} className="sm:col-span-2">
              <Textarea {...register("description")} />
            </Field>
            <Field label="Owner" error={err("owner")}><Input {...register("owner")} /></Field>
            <Field label="Category" error={err("category")}><Input placeholder="e.g. Product launch" {...register("category")} /></Field>
            <Field label="Priority" error={err("priority")}>
              <Select {...register("priority")}>{TASK_PRIORITIES.map((p) => <option key={p}>{p}</option>)}</Select>
            </Field>
            <Field label="Status" error={err("status")}>
              <Select {...register("status")}>{PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
            </Field>
            <Field label="Start date" error={err("startDate")}><Input type="date" {...register("startDate")} /></Field>
            <Field label="Target date" error={err("targetDate")}><Input type="date" {...register("targetDate")} /></Field>
            <Field label="Risks" error={err("risks")} className="sm:col-span-2"><Textarea {...register("risks")} /></Field>
            <Field label="Notes" error={err("notes")} className="sm:col-span-2"><Textarea {...register("notes")} /></Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : project ? "Save changes" : "Create project"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
