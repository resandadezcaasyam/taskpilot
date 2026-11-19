import { db } from "./db";
import { literalOnly } from "./like";
import { resolveCounts, suggestStatus, uatMetrics, uatNextActions } from "./uat";

const featureInclude = {
  project: { select: { id: true, name: true } },
  testCases: { select: { result: true, linkedIssueId: true } },
} as const;

function enrich(
  f: {
    id: string; status: string; signOffStatus: string; fixDeployedAt: Date | null; targetDate: Date | null;
    manualTotal: number | null; manualPassed: number | null; manualFailed: number | null; manualBlocked: number | null;
    testCases: { result: string; linkedIssueId: string | null }[];
  },
  now: Date,
) {
  const { counts, source } = resolveCounts(f.testCases, f);
  const failedWithIssue = f.testCases.filter((t) => t.result === "Fail" && t.linkedIssueId).length;
  const actions = uatNextActions({ ...f, failedWithIssue }, counts, now);
  return {
    counts,
    source,
    metrics: uatMetrics(counts),
    actions,
    suggestedStatus: suggestStatus(f, counts, Boolean(f.fixDeployedAt)),
  };
}

export async function listUatFeatures(filter: { project?: string; status?: string; q?: string } = {}, now = new Date()) {
  const rows = await db.uatFeature.findMany({
    where: {
      ...(filter.project ? { projectId: filter.project === "none" ? null : filter.project } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.q?.trim() ? { OR: [{ name: { contains: filter.q.trim() } }, { releaseVersion: { contains: filter.q.trim() } }, { owner: { contains: filter.q.trim() } }] } : {}),
    },
    include: featureInclude,
    orderBy: [{ targetDate: "asc" }, { createdAt: "desc" }],
  });
  return literalOnly(rows, filter.q ?? "").map((f) => ({ feature: f, ...enrich(f, now) }));
}

export async function getUatFeature(id: string, now = new Date()) {
  const feature = await db.uatFeature.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      testCases: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: {
          evidence: { orderBy: { createdAt: "desc" } },
          linkedIssue: { select: { id: true, seq: true, title: true, status: true } },
        },
      },
    },
  });
  if (!feature) return null;
  return { feature, ...enrich(feature, now) };
}

/** Primary next action for every UAT feature that still needs attention. */
export async function getUatActions(now = new Date()) {
  const all = await listUatFeatures({}, now);
  return all
    .filter((x) => x.actions.length > 0)
    .map((x) => ({ feature: x.feature, action: x.actions[0], metrics: x.metrics }))
    .sort((a, b) => b.action.urgency - a.action.urgency);
}
