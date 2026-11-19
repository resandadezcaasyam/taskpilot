import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ActivityList } from "@/components/activity-list";
import { DueText, HealthBadge, PriorityBadge, StatusBadge } from "@/components/badges";
import { IssueStatusPill, UatStatusPill } from "@/components/pills";
import { issueCode } from "@/lib/issues";
import { MilestoneList, ProjectDetailActions } from "@/components/project-detail-client";
import { Card, EmptyState, SectionHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { CLOSED_STATUSES, taskCode } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { getProjectDetail, listProjectOptions } from "@/lib/queries";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, options] = await Promise.all([getProjectDetail(id), listProjectOptions()]);
  if (!detail) notFound();
  const { project, stats, activities } = detail;
  const open = project.tasks.filter((t) => !(CLOSED_STATUSES as readonly string[]).includes(t.status));
  const closed = project.tasks.filter((t) => (CLOSED_STATUSES as readonly string[]).includes(t.status));

  const metrics = [
    ["Total tasks", stats.totalTasks],
    ["Completed", stats.completedTasks],
    ["Open blockers", stats.blocked],
    ["Overdue", stats.overdue],
    ["Due in 7 days", stats.upcoming],
    ["Open issues", stats.openIssues],
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Projects
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">{project.status}</span>
              <PriorityBadge priority={project.priority} />
              {project.owner && <span>Owner: {project.owner}</span>}
              {project.targetDate && <span>Target {formatDate(project.targetDate)}</span>}
            </div>
          </div>
          <ProjectDetailActions project={project} projects={options} taskCount={project.tasks.length} />
        </div>
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-semibold tabular-nums tracking-tight">{stats.progress}%</span>
            <span className="text-sm text-muted-foreground">complete</span>
          </div>
          <HealthBadge level={stats.health.level} reason={stats.health.reason} />
        </div>
        <Progress value={stats.progress} tone={stats.health.level === "at-risk" ? "danger" : undefined} className="h-2" />
        <p className="text-xs text-muted-foreground">
          Method: the average of each task&apos;s progress. Done tasks count as 100%, cancelled tasks are ignored.
        </p>
        <dl className="grid grid-cols-3 gap-3 border-t border-border pt-4 md:grid-cols-6">
          {metrics.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-lg font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card>
            <SectionHeader title="Open tasks" description={`${open.length} open`} />
            {open.length === 0 ? (
              <EmptyState title="No open tasks" description="Use “Add task” to create the first one for this project." />
            ) : (
              <ul>
                {open.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
                    <div className="min-w-0">
                      <Link href={`/tasks/${t.id}`} className="block truncate text-sm font-medium hover:text-primary">{t.title}</Link>
                      <p className="font-mono text-xs text-muted-foreground">{taskCode(t.seq)}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
                      <StatusBadge status={t.status} />
                      <PriorityBadge priority={t.priority} />
                      <DueText date={t.dueDate} status={t.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {closed.length > 0 && (
            <Card>
              <SectionHeader title="Closed tasks" description={`${closed.length} done or cancelled`} />
              <ul>
                {closed.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 border-t border-border px-5 py-2.5">
                    <Link href={`/tasks/${t.id}`} className="truncate text-sm text-muted-foreground hover:text-foreground">{t.title}</Link>
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {(project.description || project.risks || project.notes) && (
            <Card className="space-y-4 p-5 text-sm">
              {project.description && <div><p className="font-medium">Overview</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{project.description}</p></div>}
              {project.risks && <div><p className="font-medium">Risks</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{project.risks}</p></div>}
              {project.notes && <div><p className="font-medium">Notes</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{project.notes}</p></div>}
            </Card>
          )}
          <Card>
            <SectionHeader title="UAT features" description={`${project.uatFeatures.length} total`} />
            {project.uatFeatures.length === 0 ? <p className="px-5 pb-4 text-[13px] text-muted-foreground">No UAT features for this project.</p> : (
              <ul>{project.uatFeatures.map((f) => (<li key={f.id} className="flex items-center justify-between gap-2 border-t border-border px-5 py-2.5 text-sm"><Link href={`/uat/${f.id}`} className="truncate hover:text-primary">{f.name}</Link><UatStatusPill value={f.status} /></li>))}</ul>
            )}
          </Card>
          <Card>
            <SectionHeader title="Open issues" description={`${project.issues.length} open`} />
            {project.issues.length === 0 ? <p className="px-5 pb-4 text-[13px] text-muted-foreground">No open issues.</p> : (
              <ul>{project.issues.map((i) => (<li key={i.id} className="flex items-center justify-between gap-2 border-t border-border px-5 py-2.5 text-sm"><Link href={`/issues/${i.id}`} className="truncate hover:text-primary"><span className="mr-1.5 font-mono text-xs text-muted-foreground">{issueCode(i.seq)}</span>{i.title}</Link><IssueStatusPill value={i.status} /></li>))}</ul>
            )}
          </Card>
          <Card>
            <SectionHeader title="Milestones" />
            <MilestoneList projectId={project.id} milestones={project.milestones} />
          </Card>
          <Card>
            <SectionHeader title="Activity timeline" />
            <ActivityList items={activities} />
          </Card>
        </div>
      </div>
    </div>
  );
}
