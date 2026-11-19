import { daysFromToday, daysSince } from "./dates";

export const ISSUE_STATUSES = [
  "Reported", "Validating", "Escalated", "Investigating", "Fix In Progress", "Pending Verification", "Resolved", "Closed",
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export const ISSUE_SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;
export const ISSUE_CATEGORIES = ["Bug", "Data issue", "Operational", "Integration", "Performance", "Access / permission", "Question", "Other"] as const;
export const CLOSED_ISSUE_STATUSES: readonly string[] = ["Resolved", "Closed"];
export const isIssueOpen = (status: string) => !CLOSED_ISSUE_STATUSES.includes(status);
export const issueCode = (seq: number) => `ISS-${String(seq).padStart(4, "0")}`;

export interface IssueInput {
  status: string;
  severity: string;
  description: string | null;
  impact: string | null;
  reportedBy: string | null;
  responsiblePic: string | null;
  nextFollowUpDate: Date | null;
  expectedResolution: Date | null;
  /** most recent of: last update posted, or the issue's own updatedAt */
  lastActivityAt: Date;
}

export interface IssueAction {
  kind: "Collect info" | "Validate" | "Escalate" | "Request update" | "Verify fix" | "Confirm" | "Close" | "Assign PIC" | "Wait";
  text: string;
  urgency: number; // 0-100
}

const SEVERITY_POINTS: Record<string, number> = { Critical: 40, High: 30, Medium: 15, Low: 5 };

/** What to do next for an issue, based on its status and how stale it is. Null when nothing is needed. */
export function issueNextAction(i: IssueInput, now: Date, inactivityDays = 3): IssueAction | null {
  if (i.status === "Closed") return null;
  const idle = Math.max(0, daysSince(i.lastActivityAt, now));
  const fu = i.nextFollowUpDate ? daysFromToday(i.nextFollowUpDate, now) : null;
  const followUpDue = fu !== null && fu <= 0;
  const late = i.expectedResolution ? daysFromToday(i.expectedResolution, now) < 0 : false;
  const pic = i.responsiblePic?.trim() || "the responsible PIC";
  const requester = i.reportedBy?.trim() || "the requester";

  let kind: IssueAction["kind"];
  let text: string;
  let needsMe = false;
  switch (i.status) {
    case "Reported": {
      const missing = [!i.description?.trim() && "description", !i.impact?.trim() && "impact", !i.reportedBy?.trim() && "who reported it"].filter(Boolean) as string[];
      needsMe = true;
      if (missing.length) {
        kind = "Collect info";
        text = `Collect missing information: ${missing.join(", ")}.`;
      } else {
        kind = "Validate";
        text = "Validate the issue details and confirm it can be reproduced.";
      }
      break;
    }
    case "Validating":
      needsMe = true;
      kind = "Escalate";
      text = "Finish validating, then escalate to engineering with the details collected.";
      break;
    case "Escalated":
    case "Investigating":
    case "Fix In Progress": {
      if (!i.responsiblePic?.trim()) {
        kind = "Assign PIC";
        text = "Assign a responsible PIC so someone owns the investigation.";
        needsMe = true;
      } else if (followUpDue || idle >= inactivityDays) {
        kind = "Request update";
        text = i.status === "Fix In Progress" ? `Ask ${pic} for a fix ETA and the deployment plan.` : `Request an investigation update from ${pic}.`;
      } else {
        kind = "Wait";
        text = `Waiting on ${pic}.${i.nextFollowUpDate ? "" : " Set a follow-up date so you do not forget."}`;
      }
      break;
    }
    case "Pending Verification":
      needsMe = true;
      kind = "Verify fix";
      text = `Verify the deployed fix${i.reportedBy?.trim() ? ` with ${requester}` : ""}.`;
      break;
    case "Resolved":
      needsMe = true;
      kind = "Confirm";
      text = `Confirm the resolution with ${requester}, then close the issue.`;
      break;
    default:
      return null;
  }

  let urgency = (SEVERITY_POINTS[i.severity] ?? 15) + (needsMe ? 10 : 0);
  if (followUpDue) urgency += fu !== null && fu < 0 ? 25 : 20;
  if (late) urgency += 20;
  urgency += Math.min(15, idle * 3);
  if (kind === "Wait") urgency = Math.round(urgency * 0.4);
  return { kind, text, urgency: Math.min(100, urgency) };
}
