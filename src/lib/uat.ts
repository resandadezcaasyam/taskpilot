/**
 * UAT metrics and next-action rules (pure functions).
 *
 * FORMULAS (T = total test cases, P = passed, F = failed, B = blocked, N = not run)
 *   Executed             = P + F                 (a blocked or not-run case has not been executed)
 *   Execution progress   = Executed / T          (coverage: how much has actually been tried)
 *   Pass rate            = P / Executed          (quality of what was tried; n/a until something is executed)
 *   Passed share         = P / T                 (how close to "everything passes")
 *   Remaining            = N + B                 (cases still to be executed)
 * A feature is ready for sign-off only when P = T (and T > 0).
 */
import { daysFromToday } from "./dates";

export const UAT_STATUSES = ["Not Started", "Preparing", "In Progress", "Blocked", "Retesting", "Ready for Sign-off", "Completed"] as const;
export type UatStatus = (typeof UAT_STATUSES)[number];
export const SIGNOFF_STATUSES = ["Pending", "Requested", "Signed Off", "Rejected"] as const;
export const TEST_RESULT_VALUES = ["Pass", "Fail", "Blocked", "Not Run"] as const;

export interface UatCounts {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  notRun: number;
}

export function countCases(cases: { result: string }[]): UatCounts {
  const c = { total: cases.length, passed: 0, failed: 0, blocked: 0, notRun: 0 };
  for (const t of cases) {
    if (t.result === "Pass") c.passed++;
    else if (t.result === "Fail") c.failed++;
    else if (t.result === "Blocked") c.blocked++;
    else c.notRun++;
  }
  return c;
}

/** Individual test cases win; manual aggregate counts are only used when there are none. */
export function resolveCounts(
  cases: { result: string }[],
  manual: { manualTotal: number | null; manualPassed: number | null; manualFailed: number | null; manualBlocked: number | null },
): { counts: UatCounts; source: "cases" | "manual" | "none" } {
  if (cases.length > 0) return { counts: countCases(cases), source: "cases" };
  if (manual.manualTotal !== null && manual.manualTotal > 0) {
    const passed = manual.manualPassed ?? 0;
    const failed = manual.manualFailed ?? 0;
    const blocked = manual.manualBlocked ?? 0;
    return {
      counts: { total: manual.manualTotal, passed, failed, blocked, notRun: Math.max(0, manual.manualTotal - passed - failed - blocked) },
      source: "manual",
    };
  }
  return { counts: { total: 0, passed: 0, failed: 0, blocked: 0, notRun: 0 }, source: "none" };
}

export function uatMetrics(c: UatCounts) {
  const executed = c.passed + c.failed;
  return {
    executed,
    executionProgress: c.total ? Math.round((executed / c.total) * 100) : 0,
    passRate: executed > 0 ? Math.round((c.passed / executed) * 100) : null,
    passedShare: c.total ? Math.round((c.passed / c.total) * 100) : 0,
    remaining: c.notRun + c.blocked,
  };
}

export interface UatActionInput {
  status: string;
  signOffStatus: string;
  fixDeployedAt: Date | null;
  targetDate: Date | null;
  /** failed cases that already have a linked issue */
  failedWithIssue: number;
}

export interface UatAction {
  kind: "Setup" | "Follow Up" | "Retest" | "Report" | "Execute" | "Sign-off";
  text: string;
  urgency: number; // 0-100, for ordering across features
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Ordered list of what to do next; the first entry is the primary recommendation. */
export function uatNextActions(f: UatActionInput, c: UatCounts, now: Date): UatAction[] {
  if (f.status === "Completed" || f.signOffStatus === "Signed Off") return [];
  const out: UatAction[] = [];
  const base = { Setup: 30, "Follow Up": 70, Retest: 75, Report: 65, Execute: 50, "Sign-off": 60 } as const;
  const push = (kind: UatAction["kind"], text: string) => out.push({ kind, text, urgency: base[kind] });

  if (c.total === 0) {
    push("Setup", "Add test cases (or enter counts) so UAT progress can be tracked.");
  } else {
    if (c.blocked > 0) push("Follow Up", `Follow up with the responsible engineering team to unblock ${plural(c.blocked, "test case")}.`);
    else if (f.status === "Blocked") push("Follow Up", "UAT is marked as blocked. Follow up with the responsible engineering team.");

    if (c.failed > 0 && f.fixDeployedAt) {
      push("Retest", `Retest the ${plural(c.failed, "failed test case")} now that a fix is deployed.`);
    } else if (c.failed > 0) {
      const unlinked = Math.max(0, c.failed - f.failedWithIssue);
      push(
        "Report",
        unlinked > 0
          ? `Report findings for ${plural(unlinked, "failed test case")} and coordinate fixes with engineering.`
          : `Follow up with engineering on fixes for ${plural(c.failed, "failed test case")}, and mark the fix as deployed when it ships.`,
      );
    }
    if (c.notRun > 0) push("Execute", `Execute the remaining ${plural(c.notRun, "test case")}.`);
    if (c.passed === c.total) {
      push(
        "Sign-off",
        f.signOffStatus === "Requested" ? "Follow up on the pending sign-off." : "All test cases passed. Request sign-off.",
      );
    }
  }

  const days = f.targetDate ? daysFromToday(f.targetDate, now) : null;
  const bonus = days === null ? 0 : days < 0 ? 25 : days <= 3 ? 18 : days <= 7 ? 8 : 0;
  return out.map((a) => ({ ...a, urgency: Math.min(100, a.urgency + bonus) })).sort((a, b) => b.urgency - a.urgency);
}

/** Status the data points to. Shown as a one-click suggestion; never applied silently. */
export function suggestStatus(f: { status: string; signOffStatus: string }, c: UatCounts, fixDeployed: boolean): UatStatus | null {
  if (f.status === "Preparing" && c.total > 0 && c.passed + c.failed === 0 && c.blocked === 0) return null;
  if (c.total === 0) return f.status === "Preparing" ? null : "Not Started";
  if (c.passed === c.total) return f.signOffStatus === "Signed Off" ? "Completed" : "Ready for Sign-off";
  if (c.blocked > 0 && c.notRun === 0 && c.failed === 0) return "Blocked";
  if (c.failed > 0 && fixDeployed) return "Retesting";
  if (c.passed + c.failed > 0) return "In Progress";
  return "Not Started";
}
