"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";
import { StatusBadge } from "@/components/badges";
import { addDependency, removeDependency } from "@/actions/deps";
import { taskCode } from "@/lib/constants";
import { daysFromToday } from "@/lib/dates";

interface Mini { id: string; seq: number; title: string; status: string; dueDate?: Date | null }

export function DependenciesSection({
  taskId, dependsOn, blocking, candidates,
}: {
  taskId: string;
  dependsOn: { id: string; dep: Mini }[];
  blocking: Mini[];
  candidates: { id: string; seq: number; title: string }[];
}) {
  const [choice, setChoice] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => ReturnType<typeof removeDependency>, after?: () => void) =>
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) toast.error(r.error);
        else after?.();
      } catch {
        toast.error("Could not reach the local server. Is `npm run dev` still running?");
      }
    });
  const linked = new Set(dependsOn.map((d) => d.dep.id));

  return (
    <div>
      <p className="mb-2 text-[13px] font-medium">Dependencies</p>
      {dependsOn.length === 0 && blocking.length === 0 && <p className="mb-2 text-[13px] text-muted-foreground">No dependencies. Add a task this one must wait for.</p>}
      {dependsOn.length > 0 && (
        <ul className="mb-2 space-y-1">
          {dependsOn.map(({ id, dep }) => {
            const open = dep.status !== "Done" && dep.status !== "Cancelled";
            const overdue = open && dep.dueDate && daysFromToday(dep.dueDate) < 0;
            return (
              <li key={id} className="group flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted/60">
                <span className="text-xs text-muted-foreground">Waits for</span>
                <Link href={`/tasks/${dep.id}`} className="min-w-0 flex-1 truncate hover:text-primary">
                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">{taskCode(dep.seq)}</span>{dep.title}
                </Link>
                {overdue && <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">Overdue</Badge>}
                <StatusBadge status={dep.status} />
                <button aria-label={`Remove dependency on ${dep.title}`} className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100" onClick={() => run(() => removeDependency(id))}>
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {blocking.length > 0 && (
        <ul className="mb-2 space-y-1">
          {blocking.map((b) => (
            <li key={b.id} className="flex items-center gap-2 px-1 py-1 text-sm">
              <span className="text-xs text-muted-foreground">Blocks</span>
              <Link href={`/tasks/${b.id}`} className="min-w-0 flex-1 truncate hover:text-primary">
                <span className="mr-1.5 font-mono text-xs text-muted-foreground">{taskCode(b.seq)}</span>{b.title}
              </Link>
              <StatusBadge status={b.status} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Select aria-label="Add a dependency" value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">This task depends on…</option>
          {candidates.filter((c) => !linked.has(c.id)).map((c) => (
            <option key={c.id} value={c.id}>{taskCode(c.seq)} {c.title}</option>
          ))}
        </Select>
        <Button variant="outline" disabled={!choice || pending} onClick={() => run(() => addDependency(taskId, choice), () => setChoice(""))}>Add</Button>
      </div>
    </div>
  );
}
