"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskFormDialog } from "@/components/task-form-dialog";

export function NewTaskButton({
  projects,
  defaultProjectId,
  label = "New task",
  variant = "default",
}: {
  projects: { id: string; name: string }[];
  defaultProjectId?: string;
  label?: string;
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>
      <TaskFormDialog open={open} onOpenChange={setOpen} projects={projects} defaultProjectId={defaultProjectId} />
    </>
  );
}
