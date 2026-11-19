import type { Metadata } from "next";
import { KanbanBoard } from "@/components/kanban-board";
import { UrlFilters } from "@/components/url-filters";
import { TASK_CATEGORIES, TASK_PRIORITIES } from "@/lib/constants";
import { addDays, startOfToday } from "@/lib/dates";
import { listProjectOptions, listTasks } from "@/lib/queries";

export const metadata: Metadata = { title: "Kanban Board" };

export default async function KanbanPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [all, projects] = await Promise.all([
    listTasks({ q: sp.q, priority: sp.priority, project: sp.project, category: sp.category, sort: "priority" }),
    listProjectOptions(),
  ]);
  const cutoff = addDays(startOfToday(), -30);
  const tasks = all.filter((t) => t.status !== "Cancelled" && (t.status !== "Done" || (t.completedAt && t.completedAt >= cutoff)));
  const hiddenDone = all.filter((t) => t.status === "Done").length - tasks.filter((t) => t.status === "Done").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kanban board</h1>
        <p className="mt-1 text-sm text-muted-foreground">Drag a card to change its status. Every move is saved straight to your database. Moving to Blocked or Waiting asks for the reason first.</p>
      </div>
      <UrlFilters
        basePath="/kanban"
        current={sp}
        fields={[
          { key: "q", kind: "search", placeholder: "Search tasks…" },
          { key: "project", kind: "select", label: "All projects", options: [{ value: "none", label: "No project" }, ...projects.map((p) => ({ value: p.id, label: p.name }))] },
          { key: "priority", kind: "select", label: "All priorities", options: TASK_PRIORITIES.map((p) => ({ value: p, label: p })) },
          { key: "category", kind: "select", label: "All categories", options: TASK_CATEGORIES.map((c) => ({ value: c, label: c })) },
        ]}
      />
      <KanbanBoard tasks={tasks} projects={projects} doneNote={hiddenDone > 0 ? `Showing the last 30 days. ${hiddenDone} older completed ${hiddenDone === 1 ? "task is" : "tasks are"} on My Tasks.` : "Completed in the last 30 days."} />
    </div>
  );
}
