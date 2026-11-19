import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { HealthBadge } from "@/components/badges";
import { NewProjectButton } from "@/components/project-detail-client";
import { Card, EmptyState } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { formatDate } from "@/lib/dates";
import { listProjectsWithStats } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const completed = view === "completed";
  const all = await listProjectsWithStats();
  const ongoing = all.filter((p) => p.project.status !== "Completed");
  const finished = all.filter((p) => p.project.status === "Completed");
  const list = completed ? finished : ongoing;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Progress is the average completion of a project&apos;s tasks (done = 100%, cancelled ignored).
          </p>
        </div>
        <NewProjectButton />
      </div>

      <div className="flex gap-1 border-b border-border">
        {[
          { href: "/projects", label: `Ongoing (${ongoing.length})`, active: !completed },
          { href: "/projects?view=completed", label: `Completed (${finished.length})`, active: completed },
        ].map((t) => (
          <Link key={t.href} href={t.href} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", t.active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderKanban />}
            title={completed ? "No completed projects yet" : "No projects yet"}
            description={completed ? "Projects marked Completed move here." : "Group your tasks into projects to see progress and health at a glance."}
            action={completed ? undefined : <NewProjectButton />}
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map(({ project, stats }) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="group">
              <Card className="flex h-full flex-col gap-3 p-4 transition-colors group-hover:border-primary/50">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-medium leading-snug">{project.name}</h2>
                  <span className="text-sm font-semibold tabular-nums">{stats.progress}%</span>
                </div>
                <Progress value={stats.progress} tone={stats.health.level === "at-risk" ? "danger" : undefined} />
                <HealthBadge level={stats.health.level} reason={stats.health.reason} />
                <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{stats.completedTasks}/{stats.totalTasks} tasks done</span>
                  <span>{stats.blocked} blocked</span>
                  <span>{stats.overdue} overdue</span>
                  {project.targetDate && <span>Target {formatDate(project.targetDate)}</span>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
