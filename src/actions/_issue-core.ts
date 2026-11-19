import type { Tx } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { issueCode } from "@/lib/issues";
import { nextSeq } from "./_shared";

export interface NewIssue {
  title: string;
  description?: string | null;
  projectId?: string | null;
  category?: string | null;
  severity?: string;
  reportedBy?: string | null;
  responsiblePic?: string | null;
  reportedDate?: Date;
  impact?: string | null;
  workaround?: string | null;
  rootCause?: string | null;
  expectedResolution?: Date | null;
  nextFollowUpDate?: Date | null;
}

export async function createIssueRow(tx: Tx, data: NewIssue) {
  const seq = await nextSeq(tx, "issue");
  const issue = await tx.issue.create({ data: { ...data, seq } });
  await tx.issueUpdate.create({ data: { issueId: issue.id, kind: "Update", message: "Issue reported" } });
  await logActivity(tx, {
    type: "ISSUE_CREATED",
    message: `Issue reported: ${issue.title}`,
    projectId: issue.projectId,
    meta: { code: issueCode(seq), title: issue.title, href: `/issues/${issue.id}` },
  });
  return issue;
}
