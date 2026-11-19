import { describe, expect, it } from "vitest";
import { addDaysKey, monthGrid, rangeFor, shiftKey, startOfWeekKey, titleFor, weekDays } from "@/lib/calendar";
import { mapTestCaseRows, normalizeResult, parseCsv, templateCsv } from "@/lib/csv";
import { issueNextAction, issueCode, type IssueInput } from "@/lib/issues";
import { parseDateKey } from "@/lib/dates";
import { computeIssueReminders, computeUatReminders } from "@/lib/reminders-calc";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { countCases, resolveCounts, suggestStatus, uatMetrics, uatNextActions } from "@/lib/uat";

const now = new Date("2026-11-19T03:00:00Z"); // Thu 19 Nov 2026 10:00 Jakarta
const day = (n: number) => parseDateKey(addDaysKey("2026-11-19", n));
const ago = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("CSV import", () => {
  it("parses quotes, embedded newlines, escaped quotes and CRLF", () => {
    const rows = parseCsv('Title,Steps\r\n"Login ""fast""","1. open\n2. type"\r\nPlain,x\r\n');
    expect(rows).toEqual([["Title", "Steps"], ['Login "fast"', "1. open\n2. type"], ["Plain", "x"]]);
  });
  it("detects semicolon-separated exports (common for Indonesian Excel) and a BOM", () => {
    expect(parseCsv("\uFEFFTitle;Result\nA;Pass")).toEqual([["Title", "Result"], ["A", "Pass"]]);
  });
  it("maps header aliases and normalises results", () => {
    const r = mapTestCaseRows(parseCsv("Test Case,Preconditions,Test Steps,Expected,Actual,Status,Notes,Bug ID\nBook ticket,Logged in,Pay,Issued,Issued,Passed,ok,\nRefund,,,Queued,Error,FAILED,,BUG-9"));
    expect(r.errors).toEqual([]);
    expect(r.cases.map((c) => [c.title, c.result, c.linkedBug])).toEqual([["Book ticket", "Pass", ""], ["Refund", "Fail", "BUG-9"]]);
    expect(r.cases[0].prerequisites).toBe("Logged in");
  });
  it("reports a missing title column, blank titles and unknown results", () => {
    expect(mapTestCaseRows(parseCsv("Steps\nx")).errors[0]).toMatch(/Title column/);
    const r = mapTestCaseRows(parseCsv("Title,Result\n,Pass\nA,maybe\nA,Pass"));
    expect(r.errors).toEqual(["Row 2: missing title, skipped."]);
    expect(r.warnings.some((w) => w.includes('unknown result "maybe"'))).toBe(true);
    expect(r.warnings.some((w) => w.includes("more than once"))).toBe(true);
    expect(r.cases).toHaveLength(2);
  });
  it("normalizeResult and template round-trip", () => {
    expect(["", "pass", "Failed", "blocked", "not run"].map(normalizeResult)).toEqual(["Not Run", "Pass", "Fail", "Blocked", "Not Run"]);
    expect(mapTestCaseRows(parseCsv(templateCsv())).cases).toHaveLength(2);
  });
});

describe("UAT metrics: coverage is not pass rate", () => {
  const cases = [...Array(6).fill({ result: "Pass" }), ...Array(2).fill({ result: "Fail" }), { result: "Blocked" }, { result: "Not Run" }];
  it("computes each figure from its own formula", () => {
    const m = uatMetrics(countCases(cases));
    expect(countCases(cases)).toEqual({ total: 10, passed: 6, failed: 2, blocked: 1, notRun: 1 });
    expect(m.executionProgress).toBe(80); // (6+2)/10
    expect(m.passRate).toBe(75); // 6/(6+2)
    expect(m.passedShare).toBe(60); // 6/10
    expect(m.remaining).toBe(2); // not run + blocked
  });
  it("pass rate is n/a until something is executed", () => {
    expect(uatMetrics({ total: 5, passed: 0, failed: 0, blocked: 0, notRun: 5 }).passRate).toBeNull();
    expect(uatMetrics({ total: 0, passed: 0, failed: 0, blocked: 0, notRun: 0 }).executionProgress).toBe(0);
  });
  it("falls back to manual counts only when there are no test cases", () => {
    const manual = { manualTotal: 20, manualPassed: 14, manualFailed: 2, manualBlocked: 1 };
    expect(resolveCounts([], manual)).toEqual({ counts: { total: 20, passed: 14, failed: 2, blocked: 1, notRun: 3 }, source: "manual" });
    expect(resolveCounts([{ result: "Pass" }], manual).source).toBe("cases");
    expect(resolveCounts([], { manualTotal: null, manualPassed: null, manualFailed: null, manualBlocked: null }).source).toBe("none");
  });
});

describe("UAT next actions (spec examples)", () => {
  const f = (o = {}) => ({ status: "In Progress", signOffStatus: "Pending", fixDeployedAt: null, targetDate: null, failedWithIssue: 0, ...o });
  const c = (o = {}) => ({ total: 10, passed: 5, failed: 0, blocked: 0, notRun: 5, ...o });
  it("not-run cases -> execute remaining test cases", () => expect(uatNextActions(f(), c(), now)[0].text).toBe("Execute the remaining 5 test cases."));
  it("failed cases -> report findings and coordinate fixes", () => {
    const a = uatNextActions(f(), c({ failed: 2, notRun: 3 }), now);
    expect(a[0].kind).toBe("Report");
    expect(a[0].text).toContain("Report findings for 2 failed test cases");
  });
  it("fix deployed -> retest failed cases", () => expect(uatNextActions(f({ fixDeployedAt: ago(1) }), c({ failed: 1, notRun: 4 }), now)[0].kind).toBe("Retest"));
  it("all passed -> request sign-off; requested -> follow up", () => {
    expect(uatNextActions(f(), c({ passed: 10, notRun: 0 }), now)[0].text).toBe("All test cases passed. Request sign-off.");
    expect(uatNextActions(f({ signOffStatus: "Requested" }), c({ passed: 10, notRun: 0 }), now)[0].text).toBe("Follow up on the pending sign-off.");
  });
  it("blocked -> follow up with engineering; signed off -> nothing", () => {
    expect(uatNextActions(f(), c({ blocked: 2, notRun: 3 }), now)[0].text).toContain("responsible engineering team");
    expect(uatNextActions(f({ signOffStatus: "Signed Off" }), c({ passed: 10, notRun: 0 }), now)).toEqual([]);
  });
  it("a nearby or passed target date raises urgency", () => {
    const calm = uatNextActions(f(), c(), now)[0].urgency;
    expect(uatNextActions(f({ targetDate: day(2) }), c(), now)[0].urgency).toBeGreaterThan(calm);
    expect(uatNextActions(f({ targetDate: day(-1) }), c(), now)[0].urgency).toBeGreaterThan(uatNextActions(f({ targetDate: day(2) }), c(), now)[0].urgency);
  });
  it("suggests a status from the data", () => {
    expect(suggestStatus({ status: "In Progress", signOffStatus: "Pending" }, c({ passed: 10, notRun: 0 }), false)).toBe("Ready for Sign-off");
    expect(suggestStatus({ status: "In Progress", signOffStatus: "Signed Off" }, c({ passed: 10, notRun: 0 }), false)).toBe("Completed");
    expect(suggestStatus({ status: "In Progress", signOffStatus: "Pending" }, c({ failed: 1, notRun: 4 }), true)).toBe("Retesting");
  });
});

describe("issue next actions", () => {
  const i = (o: Partial<IssueInput> = {}): IssueInput => ({
    status: "Reported", severity: "Medium", description: "d", impact: "i", reportedBy: "Sari", responsiblePic: "Andi",
    nextFollowUpDate: null, expectedResolution: null, lastActivityAt: now, ...o,
  });
  const text = (o: Partial<IssueInput>) => issueNextAction(i(o), now)?.text;
  it("walks through the lifecycle", () => {
    expect(text({ description: null, impact: "" })).toBe("Collect missing information: description, impact.");
    expect(text({})).toContain("Validate the issue details");
    expect(text({ status: "Validating" })).toContain("escalate to engineering");
    expect(text({ status: "Pending Verification" })).toBe("Verify the deployed fix with Sari.");
    expect(text({ status: "Resolved" })).toBe("Confirm the resolution with Sari, then close the issue.");
    expect(issueNextAction(i({ status: "Closed" }), now)).toBeNull();
  });
  it("requests an update once an escalated issue goes stale or its follow-up is due", () => {
    expect(text({ status: "Escalated", lastActivityAt: ago(4) })).toBe("Request an investigation update from Andi.");
    expect(text({ status: "Investigating", nextFollowUpDate: day(0) })).toBe("Request an investigation update from Andi.");
    expect(text({ status: "Fix In Progress", lastActivityAt: ago(5) })).toContain("fix ETA");
    expect(issueNextAction(i({ status: "Investigating" }), now)?.kind).toBe("Wait");
    expect(text({ status: "Escalated", responsiblePic: null })).toContain("Assign a responsible PIC");
  });
  it("ranks critical, stale issues above calm low ones", () => {
    const hot = issueNextAction(i({ status: "Escalated", severity: "Critical", lastActivityAt: ago(6), nextFollowUpDate: day(-1) }), now)!;
    const cold = issueNextAction(i({ status: "Investigating", severity: "Low" }), now)!;
    expect(hot.urgency).toBeGreaterThan(cold.urgency);
    expect(issueCode(7)).toBe("ISS-0007");
  });
});

describe("calendar helpers", () => {
  it("builds Monday-first month grids covering the whole month", () => {
    const g = monthGrid("2026-11-19");
    expect(g[0][0]).toBe("2026-10-26"); // 1 Nov 2026 is a Sunday
    expect(g.flat()).toContain("2026-11-30");
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(monthGrid("2026-02-10")).toHaveLength(5); // Feb 2026 starts on a Sunday
  });
  it("weeks, ranges, navigation and titles", () => {
    expect(startOfWeekKey("2026-11-22")).toBe("2026-11-16");
    expect(weekDays("2026-11-19")[6]).toBe("2026-11-22");
    expect(rangeFor("week", "2026-11-19")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(shiftKey("month", "2026-12-15", 1)).toBe("2027-01-01");
    expect(shiftKey("month", "2026-01-15", -1)).toBe("2025-12-01");
    expect(shiftKey("week", "2026-11-19", -1)).toBe("2026-11-12");
    expect(titleFor("month", "2026-11-19")).toBe("November 2026");
    expect(titleFor("day", "2026-11-19")).toBe("Thursday, 19 November 2026");
  });
});

describe("UAT and issue reminders", () => {
  it("UAT target: within lead time and after it has passed; none when signed off", () => {
    const f = (o = {}) => ({ id: "u", name: "Booking", status: "In Progress", signOffStatus: "Pending", targetDate: day(3), ...o });
    expect(computeUatReminders([f()], DEFAULT_SETTINGS, now)[0].message).toBe('UAT "Booking" target date is in 3 days');
    expect(computeUatReminders([f({ targetDate: day(9) })], DEFAULT_SETTINGS, now)).toEqual([]);
    expect(computeUatReminders([f({ targetDate: day(-2) })], DEFAULT_SETTINGS, now)[0].message).toContain("passed its target date 2 days ago");
    expect(computeUatReminders([f({ signOffStatus: "Signed Off" })], DEFAULT_SETTINGS, now)).toEqual([]);
  });
  it("issue follow-up due and expected resolution passed; none once resolved", () => {
    const i = (o = {}) => ({ id: "i", code: "ISS-0001", title: "API down", status: "Investigating", nextFollowUpDate: day(0), expectedResolution: day(-1), ...o });
    expect(computeIssueReminders([i()], now).map((r) => r.type)).toEqual(["FOLLOW_UP_DUE", "OVERDUE"]);
    expect(computeIssueReminders([i({ status: "Resolved" })], now)).toEqual([]);
  });
});
