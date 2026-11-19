import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { getSettings } from "./engine-data";
import { fetchWindow, literalOnly } from "./like";
import { issueNextAction, isIssueOpen, type IssueInput } from "./issues";
import { daysFromToday, startOfToday } from "./dates";

type IssueRow = {
  status: string; severity: string; description: string | null; impact: string | null; reportedBy: string | null;
  responsiblePic: string | null; nextFollowUpDate: Date | null; expectedResolution: Date | null; updatedAt: Date;
};

export const toIssueInput = (i: IssueRow): IssueInput => ({
  status: i.status, severity: i.severity, description: i.description, impact: i.impact, reportedBy: i.reportedBy,
  responsiblePic: i.responsiblePic, nextFollowUpDate: i.nextFollowUpDate, expectedResolution: i.expectedResolution,
  lastActivityAt: i.updatedAt,
});

export interface IssueListParams {
  q?: string; status?: string; severity?: string; project?: string; quick?: "open" | "followup" | "overdue";
}

export async function listIssues(params: IssueListParams = {}, now = new Date()) {
  const settings = await getSettings();
  const today = startOfToday(now);
  const and: Prisma.IssueWhereInput[] = [];
  if (params.status) and.push({ status: params.status });
  if (params.severity) and.push({ severity: params.severity });
  if (params.project === "none") and.push({ projectId: null });
  else if (params.project) and.push({ projectId: params.project });
  if (params.quick === "open") and.push({ status: { notIn: ["Resolved", "Closed"] } });
  if (params.quick === "followup") and.push({ status: { notIn: ["Resolved", "Closed"] }, nextFollowUpDate: { lte: today } });
  if (params.quick === "overdue") and.push({ status: { notIn: ["Resolved", "Closed"] }, expectedResolution: { lt: today } });
  const q = params.q?.trim();
  if (q) {
    and.push({
      OR: [
        { title: { contains: q } }, { description: { contains: q } }, { reportedBy: { contains: q } },
        { responsiblePic: { contains: q } }, { rootCause: { contains: q } }, { latestUpdate: { contains: q } },
        { project: { name: { contains: q } } },
      ],
    });
  }
  const rows = await db.issue.findMany({
    where: { AND: and },
    include: { project: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: fetchWindow(q ?? "", 500),
  });
  const out = literalOnly(rows, q ?? "").map((issue) => ({ issue, action: isIssueOpen(issue.status) ? issueNextAction(toIssueInput(issue), now, settings.inactivityDays) : null }));
  const open = (x: (typeof out)[number]) => (isIssueOpen(x.issue.status) ? 0 : 1);
  out.sort((a, b) => open(a) - open(b) || (b.action?.urgency ?? -1) - (a.action?.urgency ?? -1) || b.issue.createdAt.getTime() - a.issue.createdAt.getTime());
  return out;
}

export async function getIssue(id: string, now = new Date()) {
  const [settings, issue] = await Promise.all([
    getSettings(),
    db.issue.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        updates: { orderBy: { createdAt: "desc" } },
        testCases: { select: { id: true, title: true, feature: { select: { id: true, name: true } } } },
      },
    }),
  ]);
  if (!issue) return null;
  return { issue, action: issueNextAction(toIssueInput(issue), now, settings.inactivityDays) };
}

export async function getIssueActions(now = new Date()) {
  const rows = await listIssues({ quick: "open" }, now);
  return rows
    .filter((r) => r.action && r.action.kind !== "Wait")
    .map((r) => ({ issue: r.issue, action: r.action! }))
    .sort((a, b) => b.action.urgency - a.action.urgency);
}

export const followUpDays = (d: Date | null, now = new Date()) => (d ? daysFromToday(d, now) : null);
