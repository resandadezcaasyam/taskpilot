import type { Metadata } from "next";
import { Hourglass } from "lucide-react";
import { WaitingTable } from "@/components/waiting-table";
import { Card, EmptyState } from "@/components/ui/card";
import { addDays, dateKey, startOfToday } from "@/lib/dates";
import { getWaitingBlocked } from "@/lib/engine-data";
import { pluralize } from "@/lib/utils";

export const metadata: Metadata = { title: "Waiting & Blocked" };

export default async function WaitingPage() {
  const { rows, settings } = await getWaitingBlocked();
  const blocked = rows.filter((r) => r.task.status === "Blocked").length;
  const flagged = rows.filter((r) => r.flags.length > 0).length;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Waiting &amp; blocked</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pluralize(rows.length, "task")} that cannot move right now: {blocked} blocked, {rows.length - blocked} waiting on others, {flagged} needing attention. Most urgent first.
        </p>
      </div>
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<Hourglass />} title="Nothing is waiting or blocked" description="Tasks set to Blocked or Waiting for Others appear here with who you are waiting for and when to follow up." />
        </Card>
      ) : (
        <WaitingTable rows={rows} followUpDefault={dateKey(addDays(startOfToday(), settings.followUpSnoozeDays))} />
      )}
    </div>
  );
}
