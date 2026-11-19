"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LayoutGrid, Rows3, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";
import { QUICK_FILTERS, TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function TaskFilters({
  projects,
  current,
}: {
  projects: { id: string; name: string }[];
  current: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function update(changes: Record<string, string | undefined>) {
    const next = { ...current, ...changes };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    startTransition(() => router.replace(`/tasks${params.size ? `?${params}` : ""}`));
  }

  const view = current.view === "cards" ? "cards" : "table";
  const hasFilters = ["q", "status", "priority", "project", "category", "quick"].some((k) => current[k]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-52 flex-1 sm:max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: String(new FormData(e.currentTarget).get("q") ?? "") || undefined });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            key={current.q ?? ""}
            name="q"
            defaultValue={current.q ?? ""}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground"
          />
        </form>
        <Select aria-label="Filter by status" value={current.status ?? ""} onChange={(e) => update({ status: e.target.value || undefined })} className="h-9 w-40">
          <option value="">All statuses</option>
          {TASK_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select aria-label="Filter by priority" value={current.priority ?? ""} onChange={(e) => update({ priority: e.target.value || undefined })} className="h-9 w-36">
          <option value="">All priorities</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
        <Select aria-label="Filter by project" value={current.project ?? ""} onChange={(e) => update({ project: e.target.value || undefined })} className="h-9 w-44">
          <option value="">All projects</option>
          <option value="none">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by category" value={current.category ?? ""} onChange={(e) => update({ category: e.target.value || undefined })} className="h-9 w-44">
          <option value="">All categories</option>
          {TASK_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select aria-label="Sort tasks" value={current.sort ?? ""} onChange={(e) => update({ sort: e.target.value || undefined })} className="h-9 w-40">
          <option value="">Sort: Smart</option>
          <option value="due">Sort: Deadline</option>
          <option value="priority">Sort: Priority</option>
          <option value="updated">Sort: Recently updated</option>
          <option value="created">Sort: Newest</option>
          <option value="title">Sort: Title</option>
          <option value="status">Sort: Status</option>
        </Select>
        <div className="ml-auto flex rounded-lg border border-input bg-card p-0.5" role="group" aria-label="View">
          {(["table", "cards"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              aria-label={v === "table" ? "Table view" : "Card view"}
              onClick={() => update({ view: v })}
              className={cn("rounded-md p-1.5", view === v ? "bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground")}
            >
              {v === "table" ? <Rows3 className="size-4" /> : <LayoutGrid className="size-4" />}
            </button>
          ))}
        </div>
      </div>
      {(current.quick || hasFilters) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {current.quick && current.quick in QUICK_FILTERS && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
              {QUICK_FILTERS[current.quick as keyof typeof QUICK_FILTERS]}
              <button aria-label="Remove quick filter" onClick={() => update({ quick: undefined })}>
                <X className="size-3" />
              </button>
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => router.replace(`/tasks?view=${view}`)}>
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
}
