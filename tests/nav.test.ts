import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ICONS } from "@/components/sidebar-nav";
import { NAV_GROUPS, NAV_ITEMS, NAV_STATE_KEY, groupIdForPath, isActive, parseCollapsed, serializeCollapsed } from "@/lib/nav";

function routeExists(route: string): boolean {
  const segs = route.split("/").filter(Boolean);
  const walk = (dir: string, i: number): boolean => {
    if (i === segs.length) return fs.existsSync(path.join(dir, "page.tsx"));
    return fs.readdirSync(dir, { withFileTypes: true }).some((e) => e.isDirectory() && e.name === segs[i] && walk(path.join(dir, e.name), i + 1));
  };
  return walk(path.resolve("src/app"), 0);
}

describe("sidebar structure", () => {
  it("has the five groups, in the requested order, with the requested items", () => {
    expect(NAV_GROUPS.map((g) => [g.label, g.items.map((i) => i.label)])).toEqual([
      ["Overview", ["Dashboard", "Today Planner", "Next Actions"]],
      ["Task & Planning", ["My Tasks", "Brain Dump", "Projects", "Kanban Board", "Calendar"]],
      ["Work Management", ["UAT Tracker", "Issue & Escalation", "Waiting & Blocked"]],
      ["Insights & Reports", ["Weekly Report", "Analytics", "Activity History"]],
      ["System", ["Settings"]],
    ]);
  });

  it("keeps every existing route, exactly once, and each one is a real page", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(hrefs.slice().sort()).toEqual(["/", "/activity", "/analytics", "/calendar", "/capture", "/issues", "/kanban", "/next-actions", "/projects", "/settings", "/tasks", "/today", "/uat", "/waiting", "/weekly"]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(new Set(NAV_GROUPS.map((g) => g.id)).size).toBe(NAV_GROUPS.length);
    for (const href of hrefs) expect(routeExists(href), href).toBe(true);
  });

  it("keeps each menu item's existing icon", () => {
    const icons = Object.fromEntries(NAV_ITEMS.map((i) => [i.label, i.icon]));
    expect(icons).toEqual({
      Dashboard: "layout-dashboard", "Today Planner": "sun", "Next Actions": "compass", "My Tasks": "list-checks", "Brain Dump": "zap", Projects: "folder-kanban",
      "Kanban Board": "columns-3", Calendar: "calendar-days", "UAT Tracker": "flask-conical", "Issue & Escalation": "siren", "Waiting & Blocked": "hourglass",
      "Weekly Report": "mail", Analytics: "bar-chart-3", "Activity History": "history", Settings: "settings",
    });
    for (const i of NAV_ITEMS) expect(ICONS[i.icon], i.label).toBeTruthy();
  });
});

describe("which item and group is active", () => {
  it("matches sub-pages but never lets '/' match everything", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/", "/tasks")).toBe(false);
    expect(isActive("/tasks", "/tasks")).toBe(true);
    expect(isActive("/tasks", "/tasks/abc")).toBe(true);
    expect(isActive("/uat", "/uat/123")).toBe(true);
    expect(isActive("/settings", "/settings/data")).toBe(true);
    expect(isActive("/tasks", "/tasks-archive")).toBe(false);
  });
  it("finds the group of any page, and none for pages outside the menu", () => {
    const g = (p: string) => groupIdForPath(p);
    expect([g("/"), g("/today"), g("/next-actions")]).toEqual(["overview", "overview", "overview"]);
    expect([g("/tasks/abc"), g("/capture"), g("/projects/p1"), g("/kanban"), g("/calendar")]).toEqual(["planning", "planning", "planning", "planning", "planning"]);
    expect([g("/uat/x"), g("/issues/y"), g("/waiting")]).toEqual(["work", "work", "work"]);
    expect([g("/weekly"), g("/analytics"), g("/activity")]).toEqual(["insights", "insights", "insights"]);
    expect(g("/settings/data")).toBe("system");
    expect([g("/search"), g("/nope")]).toEqual([null, null]);
  });
});

describe("remembering collapsed groups", () => {
  it("round-trips, and ignores anything damaged or unknown", () => {
    expect(NAV_STATE_KEY).toBe("taskpilot.sidebar.collapsed");
    expect(parseCollapsed(serializeCollapsed(["work", "insights", "work"]))).toEqual(["work", "insights"]);
    for (const bad of [null, undefined, "", "not json", "{}", '"work"', "42", "null"]) expect(parseCollapsed(bad as string | null)).toEqual([]);
    expect(parseCollapsed('["work","gone",5,null,"system"]')).toEqual(["work", "system"]);
  });
});
