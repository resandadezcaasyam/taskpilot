import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Hourglass, Lock } from "lucide-react";
import { ActivityList } from "@/components/activity-list";
import { DueText, PriorityBadge, StatusBadge } from "@/components/badges";
import { Card, SectionHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { CommentSection, ProgressControl, SubtaskList, TaskDetailActions } from "@/components/task-detail-client";
import { taskCode } from "@/lib/constants";
import { daysSince, formatDate, formatDateTime } from "@/lib/dates";
import { AttachmentsSection } from "@/components/attachments-section";
import { DependenciesSection } from "@/components/dependencies-section";
import { getTask, listDependencyCandidates, listProjectOptions } from "@/lib/queries";
import { formatMinutes } from "@/lib/utils";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [task, projects, candidates] = await Promise.all([getTask(id), listProjectOptions(), listDependencyCandidates(id)]);
  if (!task) notFound();

  const rows: [string, React.ReactNode][] = [
    ["Project", task.project ? <Link key="p" href={`/projects/${task.project.id}`} className="hover:text-primary">{task.project.name}</Link> : "—"],
    ["Category", task.category],
    ["Start date", formatDate(task.startDate)],
    ["Deadline", <DueText key="d" date={task.dueDate} status={task.status} className="text-sm" />],
    ["Follow-up", formatDate(task.followUpDate)],
    ["Assignee / PIC", task.assignee ?? "—"],
    ["Stakeholder", task.stakeholder ?? "—"],
    ["Estimated", formatMinutes(task.estimatedMinutes) ?? "—"],
    ["Actual", formatMinutes(task.actualMinutes) ?? "—"],
    ["Importance", `${task.businessImportance} / 5`],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/tasks" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> My Tasks
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted-foreground">{taskCode(task.seq)}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              {task.tags.map((t) => (
                <span key={t.tagId} className="text-xs text-muted-foreground">#{t.tag.name}</span>
              ))}
            </div>
          </div>
          <TaskDetailActions task={task} projects={projects} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {task.status === "Blocked" && (
            <Card className="border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
              <p className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
                <Lock className="size-4" /> Blocked{task.blockedAt ? ` for ${daysSince(task.blockedAt)} days` : ""}
              </p>
              <p className="mt-1 text-sm">{task.blockerDescription}</p>
            </Card>
          )}
          {task.status === "Waiting for Others" && (
            <Card className="border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                <Hourglass className="size-4" /> Waiting for {task.waitingFor}
                {task.blockedAt ? ` · ${daysSince(task.blockedAt)} days` : ""}
              </p>
              {task.followUpDate && <p className="mt-1 text-sm">Follow up on {formatDate(task.followUpDate)}</p>}
            </Card>
          )}

          <Card className="space-y-5 p-5">
            {task.nextAction && (
              <div>
                <p className="text-[13px] font-medium">Next action</p>
                <p className="mt-1 rounded-lg bg-primary-soft px-3 py-2 text-sm">
                  {task.nextAction}
                  {task.nextActionDue && <span className="text-muted-foreground"> · by {formatDate(task.nextActionDue)}</span>}
                </p>
              </div>
            )}
            <div>
              <p className="text-[13px] font-medium">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{task.description || "No description yet."}</p>
            </div>
            {task.notes && (
              <div>
                <p className="text-[13px] font-medium">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{task.notes}</p>
              </div>
            )}
            <SubtaskList taskId={task.id} subtasks={task.subtasks} />
            <DependenciesSection
              taskId={task.id}
              dependsOn={task.dependsOn.map((d) => ({ id: d.id, dep: d.dependsOn }))}
              blocking={task.blocking.map((b) => b.task)}
              candidates={candidates}
            />
            <AttachmentsSection taskId={task.id} attachments={task.attachments} />
            <CommentSection taskId={task.id} comments={task.comments} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="space-y-4 p-5">
            <div>
              <Progress value={task.progress} />
            </div>
            <ProgressControl taskId={task.id} value={task.progress} disabled={task.status === "Done"} />
            <dl className="divide-y divide-border text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 py-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              Created {formatDateTime(task.createdAt)} · Updated {formatDateTime(task.updatedAt)}
              {task.completedAt ? ` · Completed ${formatDateTime(task.completedAt)}` : ""}
            </p>
          </Card>
          <Card>
            <SectionHeader title="History" />
            <ActivityList items={task.activities} showTask={false} />
          </Card>
        </div>
      </div>
    </div>
  );
}
