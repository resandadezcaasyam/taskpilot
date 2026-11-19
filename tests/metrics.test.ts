import { describe, expect, it } from "vitest";
import { completionRate, projectHealth, projectProgress } from "@/lib/metrics";

describe("projectProgress", () => {
  it("is 0 with no tasks", () => expect(projectProgress([])).toBe(0));
  it("counts Done as 100 and ignores Cancelled", () => {
    expect(
      projectProgress([
        { status: "Done", progress: 40 },
        { status: "In Progress", progress: 50 },
        { status: "Cancelled", progress: 0 },
      ]),
    ).toBe(75);
  });
  it("rounds to a whole percent", () => {
    expect(projectProgress([{ status: "To Do", progress: 0 }, { status: "To Do", progress: 0 }, { status: "Done", progress: 0 }])).toBe(33);
  });
});

describe("completionRate", () => {
  it("excludes cancelled tasks from the denominator", () => expect(completionRate(3, 10, 2)).toBe(38));
  it("handles empty data", () => expect(completionRate(0, 0, 0)).toBe(0));
});

describe("projectHealth", () => {
  const base = { status: "Active", totalTasks: 5, overdue: 0, blocked: 0, waiting: 0 };
  it("is healthy by default", () => expect(projectHealth(base).level).toBe("healthy"));
  it("is at risk with overdue or multiple blocked tasks", () => {
    expect(projectHealth({ ...base, overdue: 1 }).level).toBe("at-risk");
    expect(projectHealth({ ...base, blocked: 2 }).level).toBe("at-risk");
  });
  it("is watch with one blocked or a waiting task", () => {
    expect(projectHealth({ ...base, blocked: 1 }).level).toBe("watch");
    expect(projectHealth({ ...base, waiting: 1 }).level).toBe("watch");
  });
  it("is idle with no tasks", () => expect(projectHealth({ ...base, totalTasks: 0 }).level).toBe("idle"));
});
