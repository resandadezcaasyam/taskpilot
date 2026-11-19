import Link from "next/link";
import { CalendarClock, FolderKanban, Target } from "lucide-react";
import { ActivityList } from "@/components/activity-list";
import { DueText, HealthBadge, PriorityBadge } from "@/components/badges";
import { RecommendationCard } from "@/components/recommendation-card";
import { RemindersList } from "@/components/reminders-ui";
import { NewTaskButton } from "@/components/new-task-button";
import { Card, EmptyState, SectionHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { APP_TZ, dateKey } from "@/lib/dates";
import { getActiveReminders, getSettings, toReminderItem } from "@/lib/engine-data";
import { getDashboardData, listProjectOptions } from "@/lib/queries";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const now = new Date();
  const [data, projectOptions, reminders, settings] = await Promise.all([getDashboardData(now), listProjectOptions(), getActiveReminders(now), getSettings()]);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, hour: "2-digit", hour12: false }).format(now)) % 24;
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const projectsFirst = settings.dashboardLayout === "projects";
  const c = data.counts;

  const cards: { label: string; value: string | number; href: string; tone?: "danger" | "warn" }[] = [
    { label: "Active tasks", value: c.active, href: "/tasks?quick=active" },
    { label: "Due today", value: c.dueToday, href: "/tasks?quick=due-today", tone: c.dueToday ? "warn" : undefined },
    { label: "Overdue", value: c.overdue, href: "/tasks?quick=overdue", tone: c.overdue ? "danger" : undefined },
    { label: "In progress", value: c.inProgress, href: "/tasks?quick=in-progress" },
    { label: "Waiting for others", value: c.waiting, href: "/tasks?quick=waiting" },
    { label: "Blocked", value: c.blocked, href: "/tasks?quick=blocked", tone: c.blocked ? "danger" : undefined },
    { label: "Completed this week", value: c.completedWeek, href: "/tasks?quick=completed-week" },
    { label: "Completion rate", value: `${c.completionRate}%`, href: "/tasks?quick=done" },
  ];

  const todayLabel = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{settings.displayName ? `${greeting}, ${settings.displayName}` : "Dashboard"}</h1>
          <p className="mt-1 text-sm text-muted-foreground" data-today={dateKey(now)}>{todayLabel}</p>
        </div>
        <NewTaskButton projects={projectOptions} />
      </div>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="group">
            <Card className="h-full p-4 transition-colors group-hover:border-primary/50">
              <p className="text-[13px] text-muted-foreground">{card.label}</p>
              <p
                className={cn(
                  "mt-1 text-3xl font-semibold tabular-nums tracking-tight",
                  card.tone === "danger" && "text-red-600 dark:text-red-400",
                  card.tone === "warn" && "text-amber-600 dark:text-amber-400",
                )}
              >
                {card.value}
              </p>
            </Card>
          </Link>
        ))}
      </section>

      <div className={cn("grid gap-5", projectsFirst ? "lg:grid-cols-[380px_1fr]" : "lg:grid-cols-[1fr_380px]")}>
        <div className={cn("space-y-5", projectsFirst && "lg:order-2")}>
          <Card className="border-primary/25">
            <SectionHeader
              title="Today's focus"
              description="Your top five from the Next Action Engine, recalculated from today's date."
              action={<Link href="/next-actions" className="text-[13px] text-primary hover:underline">All next actions</Link>}
            />
            {data.focus.length === 0 ? (
              <EmptyState
                icon={<Target />}
                title={c.totalAll === 0 ? "Nothing to focus on yet" : "You are all caught up"}
                description={c.totalAll === 0 ? "Create a task and it will be ranked here automatically." : "No open tasks need attention right now."}
                action={c.totalAll === 0 ? <NewTaskButton projects={projectOptions} label="Create your first task" /> : undefined}
              />
            ) : (
              <ol>
                {data.focus.map((rec) => (
                  <RecommendationCard key={rec.task.id} rec={rec} followUpDays={data.followUpDays} compact />
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <SectionHeader title="Upcoming deadlines" description="Open tasks due in the next 7 days" />
            {data.upcoming.length === 0 ? (
              <EmptyState icon={<CalendarClock />} title="No deadlines this week" description="Tasks with a due date in the next seven days appear here." />
            ) : (
              <ul>
                {data.upcoming.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
                    <div className="min-w-0">
                      <Link href={`/tasks/${t.id}`} className="block truncate text-sm font-medium hover:text-primary">{t.title}</Link>
                      <p className="text-xs text-muted-foreground">{t.project?.name ?? "No project"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <PriorityBadge priority={t.priority} />
                      <DueText date={t.dueDate} status={t.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className={cn("space-y-5", projectsFirst && "lg:order-1")}>
          <Card>
            <SectionHeader title="Reminders" description={reminders.length ? `${reminders.length} need attention` : undefined} />
            <RemindersList reminders={reminders.slice(0, 5).map(toReminderItem)} />
            {reminders.length > 5 && <p className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">+{reminders.length - 5} more in the bell menu</p>}
          </Card>
          <Card>
            <SectionHeader title="Project health" action={<Link href="/projects" className="text-[13px] text-primary hover:underline">All projects</Link>} />
            {data.projects.length === 0 ? (
              <EmptyState icon={<FolderKanban />} title="No active projects" description="Active and at-risk projects show their progress and blockers here." />
            ) : (
              <ul>
                {data.projects.map((p) => (
                  <li key={p.id} className="space-y-2 border-t border-border px-5 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/projects/${p.id}`} className="truncate text-sm font-medium hover:text-primary">{p.name}</Link>
                      <span className="text-sm tabular-nums">{p.progress}%</span>
                    </div>
                    <Progress value={p.progress} tone={p.health.level === "at-risk" ? "danger" : undefined} />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <HealthBadge level={p.health.level} reason={p.health.reason} />
                      <span>{p.completedTasks}/{p.totalTasks} done</span>
                      <span>{p.blocked} blocked</span>
                      <span>{p.openIssues} open issues</span>
                      <span>{p.upcoming} due soon</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionHeader title="Recent activity" action={<Link href="/activity" className="text-[13px] text-primary hover:underline">View all</Link>} />
            <ActivityList items={data.recent} />
          </Card>
        </div>
      </div>
    </div>
  );
}
