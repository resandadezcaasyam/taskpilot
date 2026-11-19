import type { Metadata } from "next";
import { BrainDump } from "@/components/brain-dump";
import { getBrainDumpKnown, getRecentTitles, getRoutine } from "@/lib/capture-data";

export const metadata: Metadata = { title: "Brain Dump" };

export default async function CapturePage() {
  const [known, routine, recent] = await Promise.all([getBrainDumpKnown(), getRoutine(), getRecentTitles()]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Brain dump</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Type or paste everything you did or need to do, one line each. TaskPilot reads dates, priority, project and more from the words (typos are fine), recognises tasks and projects you already have, shows a preview you can fix, and saves them all at once. Every extra field stays optional.
        </p>
      </div>
      <BrainDump known={known} routine={routine} recentTitles={recent} />
    </div>
  );
}
