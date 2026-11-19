"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, SectionHeader } from "@/components/ui/card";
import type { getAnalytics } from "@/lib/analytics-data";

type Data = Awaited<ReturnType<typeof getAnalytics>>;

const STATUS_COLORS: Record<string, string> = {
  Backlog: "#94a3b8", "To Do": "#38bdf8", "In Progress": "#6366f1", "Waiting for Others": "#f59e0b", Blocked: "#ef4444", "In Review": "#8b5cf6", Done: "#10b981", Cancelled: "#a1a1aa",
};
const PRIORITY_COLORS: Record<string, string> = { Critical: "#ef4444", High: "#f97316", Medium: "#0ea5e9", Low: "#94a3b8" };
const PRIMARY = "#6366f1";
const GOOD = "#10b981";
const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" };
const TOOLTIP = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" };

function ChartCard({ title, description, empty, rows, columns, children }: {
  title: string; description?: string; empty?: boolean; rows: Record<string, string | number>[]; columns: [string, string][]; children: React.ReactNode;
}) {
  return (
    <Card>
      <SectionHeader title={title} description={description} />
      <div className="px-4 pb-4">
        {empty ? (
          <p className="grid h-60 place-items-center text-[13px] text-muted-foreground">No data for this period yet.</p>
        ) : (
          <div className="h-60" role="img" aria-label={`${title} chart`}>
            <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>
          </div>
        )}
        {!empty && (
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">View as table</summary>
            <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-border">
              <table className="w-full text-left">
                <thead className="bg-muted"><tr>{columns.map(([, h]) => <th key={h} className="px-2.5 py-1.5 font-medium">{h}</th>)}</tr></thead>
                <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{columns.map(([k]) => <td key={k} className="px-2.5 py-1.5 tabular-nums">{r[k]}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </Card>
  );
}

const axes = (xKey: string) => (
  <>
    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
    <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--border)" }} interval="preserveStartEnd" />
    <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
    <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
  </>
);

const hbar = (data: { name: string }[], key: string, color: string | ((n: string) => string), max?: number) => (
  <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
    <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} domain={max ? [0, max] : undefined} />
    <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={120} />
    <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
    <Bar dataKey={key} radius={[0, 4, 4, 0]} fill={typeof color === "string" ? color : PRIMARY}>
      {typeof color !== "string" && data.map((d) => <Cell key={d.name} fill={color(d.name)} />)}
    </Bar>
  </BarChart>
);

export function AnalyticsCharts({ data }: { data: Data }) {
  const trendTitle = { day: "Daily", week: "Weekly", month: "Monthly" }[data.trend.granularity];
  const cats = data.byCategory.slice(0, 10);
  const projs = data.byProject.slice(0, 10);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ChartCard title="Task completion trend" description={`${trendTitle}: created vs completed`} empty={data.trend.points.every((p) => !p.created && !p.completed)} rows={data.trend.points} columns={[["label", "Period"], ["created", "Created"], ["completed", "Completed"]]}>
        <LineChart data={data.trend.points} margin={{ left: 0, right: 12, top: 8 }}>
          {axes("label")}
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="created" name="Created" stroke={PRIMARY} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="completed" name="Completed" stroke={GOOD} strokeWidth={2} dot={false} />
        </LineChart>
      </ChartCard>

      <ChartCard title="Weekly productivity" description="Tasks completed per week" empty={data.weekly.every((p) => !p.completed)} rows={data.weekly} columns={[["label", "Week starting"], ["completed", "Completed"]]}>
        <BarChart data={data.weekly} margin={{ left: 0, right: 12, top: 8 }}>
          {axes("label")}
          <Bar dataKey="completed" name="Completed" fill={GOOD} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard title="Status distribution" description="Tasks created in this period, by current status" empty={data.byStatus.length === 0} rows={data.byStatus} columns={[["name", "Status"], ["value", "Tasks"]]}>
        <PieChart>
          <Pie data={data.byStatus} dataKey="value" nameKey="name" innerRadius={48} outerRadius={84} paddingAngle={2}>
            {data.byStatus.map((s) => <Cell key={s.name} fill={STATUS_COLORS[s.name] ?? PRIMARY} />)}
          </Pie>
          <Tooltip contentStyle={TOOLTIP} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ChartCard>

      <ChartCard title="Priority distribution" description="Tasks created in this period" empty={data.byPriority.length === 0} rows={data.byPriority} columns={[["name", "Priority"], ["value", "Tasks"]]}>
        <BarChart data={data.byPriority} margin={{ left: 0, right: 12, top: 8 }}>
          {axes("name")}
          <Bar dataKey="value" name="Tasks" radius={[4, 4, 0, 0]}>
            {data.byPriority.map((p) => <Cell key={p.name} fill={PRIORITY_COLORS[p.name] ?? PRIMARY} />)}
          </Bar>
        </BarChart>
      </ChartCard>

      <ChartCard title="Monthly productivity trend" description="Created vs completed per month" empty={data.monthly.every((p) => !p.created && !p.completed)} rows={data.monthly} columns={[["label", "Month"], ["created", "Created"], ["completed", "Completed"]]}>
        <BarChart data={data.monthly} margin={{ left: 0, right: 12, top: 8 }}>
          {axes("label")}
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="created" name="Created" fill={PRIMARY} radius={[4, 4, 0, 0]} />
          <Bar dataKey="completed" name="Completed" fill={GOOD} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard title="Tasks by category" description="Top categories, tasks created in this period" empty={cats.length === 0} rows={cats} columns={[["name", "Category"], ["value", "Tasks"]]}>
        {hbar(cats, "value", PRIMARY)}
      </ChartCard>

      <ChartCard title="Tasks by project" description="Tasks created in this period" empty={projs.length === 0} rows={projs} columns={[["name", "Project"], ["value", "Tasks"]]}>
        {hbar(projs, "value", "#0ea5e9")}
      </ChartCard>

      <ChartCard title="Project progress" description="Current progress of ongoing projects" empty={data.projectProgress.length === 0} rows={data.projectProgress} columns={[["name", "Project"], ["progress", "Progress %"]]}>
        {hbar(data.projectProgress.slice(0, 10), "progress", GOOD, 100)}
      </ChartCard>

      <div className="lg:col-span-2">
        <ChartCard title="UAT execution" description="Test case results per UAT feature (current)" empty={data.uatExecution.length === 0} rows={data.uatExecution} columns={[["name", "Feature"], ["passed", "Passed"], ["failed", "Failed"], ["blocked", "Blocked"], ["notRun", "Not run"]]}>
          <BarChart data={data.uatExecution} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={140} />
            <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="passed" name="Passed" stackId="u" fill={GOOD} />
            <Bar dataKey="failed" name="Failed" stackId="u" fill="#ef4444" />
            <Bar dataKey="blocked" name="Blocked" stackId="u" fill="#f59e0b" />
            <Bar dataKey="notRun" name="Not run" stackId="u" fill="#94a3b8" />
          </BarChart>
        </ChartCard>
      </div>
    </div>
  );
}
