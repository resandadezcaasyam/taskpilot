import { describe, expect, it } from "vitest";
import { matchProject, parseBrainDump, type BrainDumpContext } from "@/lib/bulk-parse";

const now = new Date("2026-11-19T03:00:00Z"); // Thu 19 Nov 2026, Jakarta
const projects = [{ id: "p1", name: "UAT Booking" }, { id: "p2", name: "HSE Portal" }];
const ctx = (over: Partial<BrainDumpContext> = {}): BrainDumpContext => ({ projects, defaults: { status: "To Do", priority: "Medium", category: "Other", projectId: "" }, ...over });
const one = (line: string, c = ctx()) => {
  const r = parseBrainDump(line, c, now);
  expect(r.items).toHaveLength(1);
  return r.items[0];
};

describe("projects match through typos", () => {
  it("@project with typos is resolved and the match is shown", () => {
    const a = one("Check cases @bokking");
    expect(a.values.projectId).toBe("p1");
    expect(a.detected.join(" ")).toContain("matched from @bokking");
    expect(one("Review @portl").values.projectId).toBe("p2");
    expect(one("x @HSE-portal").values.projectId).toBe("p2");
    expect(matchProject("uat-bokking", projects)).toMatchObject({ id: "p1", fuzzy: true });
  });
  it("a close-but-not-sure name becomes a one-click suggestion, never a silent guess", () => {
    const l = one("x @bokin");
    expect(l.values.projectId).toBe("");
    expect(l.didYouMean).toEqual({ id: "p1", name: "UAT Booking" });
    expect(l.warnings[0]).toContain('Did you mean "UAT Booking"');
  });
  it("a name that matches nothing can become a new project (when allowed), otherwise it is only a warning", () => {
    const allowed = one("Draft spec @zeta-launch", ctx({ createMissingProjects: true }));
    expect(allowed.values.projectId).toBe("new:Zeta Launch");
    expect(allowed.newProjectName).toBe("Zeta Launch");
    expect(allowed.explicit).toContain("projectId");
    expect(one("Draft spec @zeta").warnings[0]).toMatch(/No project matches @zeta/);
    expect(one("x @zz", ctx({ createMissingProjects: true })).values.projectId).toBe(""); // too short to create from
  });
  it("still reports a real ambiguity", () => {
    const two = ctx({ projects: [...projects, { id: "p3", name: "UAT Billing" }] });
    expect(one("x @uat", two).warnings[0]).toMatch(/matches several projects/);
    expect(one("x @bokking", two).values.projectId).toBe("p1");
  });
});

describe("a project mentioned in plain words is found (typos allowed)", () => {
  it("guesses from a distinctive word", () => {
    const l = one("Retest bokking cases tomorow");
    expect(l.values).toMatchObject({ projectId: "p1", category: "UAT / QA", dueDate: "2026-11-20", title: "Retest bokking cases" });
    expect(l.detected.join(" ")).toContain("Project (guessed from the text): UAT Booking");
    expect(l.detected.join(" ")).toContain("Typo fixed: tomorow → tomorrow");
    expect(one("Update the portal docs").values.projectId).toBe("p2");
  });
  it("an explicit @project always wins, and shared or generic words never cause a guess", () => {
    expect(one("Booking review @hse").values.projectId).toBe("p2");
    const two = ctx({ projects: [...projects, { id: "p3", name: "UAT Billing" }] });
    expect(one("UAT checks", two).values.projectId).toBe(""); // "uat" belongs to two projects
    const generic = ctx({ projects: [{ id: "g", name: "Project Alpha" }] });
    expect(one("project status", generic).values.projectId).toBe("");
    expect(one("alpha status", generic).values.projectId).toBe("g");
  });
  it("tags and activity words such as UAT never imply a project", () => {
    expect(one("Check dashboard #uat").values.projectId).toBe("");
    expect(one("UAT dashboard check").values.projectId).toBe("");
    expect(one("Review booking flow #uat").values.projectId).toBe("p1"); // "booking" is distinctive
  });
  it("the page default is the fallback, not an override", () => {
    expect(one("Retest bokking cases", ctx({ defaults: { status: "To Do", priority: "Medium", category: "Other", projectId: "p2" } })).values.projectId).toBe("p1");
    expect(one("Buy coffee", ctx({ defaults: { status: "To Do", priority: "Medium", category: "Other", projectId: "p2" } })).values.projectId).toBe("p2");
  });
});

describe("people and tags snap to what already exists", () => {
  const known = ctx({ people: ["Andi", "Budi Santoso"], tags: ["booking", "vendor"] });
  it("waiting-for names", () => {
    expect(one("API fix >andy", known).values.waitingFor).toBe("Andi");
    expect(one("API fix >budi", known).values.waitingFor).toBe("Budi Santoso");
    expect(one('API fix >"Backend team"', known).values.waitingFor).toBe("Backend team");
    expect(one("API fix >andy", known).detected.join(" ")).toContain("matched from andy");
  });
  it("tags", () => {
    expect(one("Vendor call #vendr #brand-new", known).values.tags).toBe("vendor, brand-new");
    expect(one("Check #bokking", known).values.tags).toBe("booking");
  });
});

describe("keyword typos still classify the line", () => {
  it("follow-up, dates and priority words", () => {
    const l = one("Follw up Andi about the API tommorow");
    expect(l.values).toMatchObject({ category: "Stakeholder Follow-up", followUpDate: "2026-11-20" });
    expect(l.values.title).toBe("Follow up Andi about the API");
    expect(one("Retst the checkout flow on Fridy").values).toMatchObject({ category: "UAT / QA", dueDate: "2026-11-20" });
  });
});

describe("what a line states explicitly (used when it updates an existing task)", () => {
  it("only stated fields are marked", () => {
    expect(one("Follow up Andi tomorrow !h").explicit.sort()).toEqual(["followUpDate", "priority"]);
    expect(one("[x] Sent report").explicit).toEqual(["status"]);
    expect(one("[x] Sent report tomorrow").explicit).toEqual(["status"]); // finished work carries no dates
    expect(one("Plain task").explicit).toEqual([]);
    expect(one("doing: Review PRD %40 ~1h #doc => finish section 3").explicit.sort()).toEqual(["estimatedHours", "nextAction", "progress", "status", "tags"]);
    expect(one("API >Andi").explicit.sort()).toEqual(["status", "waitingFor"]);
  });
});
