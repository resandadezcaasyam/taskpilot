import type { Metadata } from "next";
import { NewTaskButton } from "@/components/new-task-button";
import { TaskFilters } from "@/components/task-filters";
import { TasksView } from "@/components/tasks-view";
import { QUICK_FILTERS, type QuickFilter } from "@/lib/constants";
import { getSettings } from "@/lib/engine-data";
import { listProjectOptions, listTasks } from "@/lib/queries";
import { pluralize } from "@/lib/utils";

export const metadata: Metadata = { title: "My Tasks" };

type Params = Record<string, string | undefined>;

export default async function TasksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const quick = sp.quick && sp.quick in QUICK_FILTERS ? (sp.quick as QuickFilter) : undefined;
  const settings = await getSettings();
  const view = sp.view === "cards" || sp.view === "table" ? sp.view : settings.defaultTaskView;
  const [tasks, projects] = await Promise.all([
    listTasks({
      q: sp.q,
      status: sp.status,
      priority: sp.priority,
      project: sp.project,
      category: sp.category,
      quick,
      sort: sp.sort,
    }),
    listProjectOptions(),
  ]);
  const filtered = Boolean(sp.q || sp.status || sp.priority || sp.project || sp.category || quick);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{quick ? QUICK_FILTERS[quick] : "My Tasks"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{pluralize(tasks.length, "task")}{filtered ? " match" : ""}</p>
        </div>
        <NewTaskButton projects={projects} />
      </div>
      <TaskFilters projects={projects} current={{ ...sp, quick, view }} />
      <TasksView tasks={tasks} projects={projects} view={view} filtered={filtered} />
    </div>
  );
}
