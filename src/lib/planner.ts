import { effectiveDays, isOpenStatus, type Recommendation } from "./engine";
import type { EngineSettings } from "./settings";

export interface PlannerSections {
  mustDo: Recommendation[];
  followUps: Recommendation[];
  focus: Recommendation[];
  quickWins: Recommendation[];
  upcoming: Recommendation[];
}

/** Estimated minutes a task adds to the day's workload (unknown estimates count as 30). */
export const plannedMinutes = (r: Pick<Recommendation, "remainingMinutes" | "durationMinutes">) =>
  r.remainingMinutes ?? r.durationMinutes ?? 30;

/**
 * Splits recommendations into the Today Planner sections. Every task appears in at most one
 * section, assigned in this order: Must Do -> Follow Up -> Recommended Focus -> Quick Wins -> Upcoming.
 */
export function buildSections(recs: Recommendation[], s: EngineSettings, now: Date): PlannerSections {
  const used = new Set<string>();
  const take = (list: Recommendation[], limit = Infinity) => {
    const out = list.filter((r) => !used.has(r.task.id)).slice(0, limit);
    out.forEach((r) => used.add(r.task.id));
    return out;
  };
  const open = recs.filter((r) => isOpenStatus(r.task.status));
  const workable = (r: Recommendation) => r.task.status !== "Blocked" && r.task.status !== "Waiting for Others";
  const days = (r: Recommendation) => effectiveDays(r.task, now);

  const mustDo = take(open.filter((r) => workable(r) && ((days(r) !== null && (days(r) as number) <= 0) || r.task.priority === "Critical")));
  const followUps = take(open.filter((r) => r.needsFollowUp));
  const focus = take(open.filter((r) => workable(r) && r.score >= 35), 5);
  const quickWins = take(
    open.filter((r) => workable(r) && r.remainingMinutes !== null && r.remainingMinutes <= s.quickWinMinutes),
    5,
  );
  const upcoming = take(
    open
      .filter((r) => days(r) !== null && (days(r) as number) >= 1 && (days(r) as number) <= 7)
      .sort((a, b) => (days(a) as number) - (days(b) as number)),
  );
  return { mustDo, followUps, focus, quickWins, upcoming };
}
