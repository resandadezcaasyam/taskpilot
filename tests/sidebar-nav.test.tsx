// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { SidebarNav } from "@/components/sidebar-nav";
import { NAV_GROUPS, NAV_STATE_KEY } from "@/lib/nav";

const GROUPS = ["Overview", "Task & Planning", "Work Management", "Insights & Reports", "System"];
const heading = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name.replace(/[&]/g, "\\$&")}`) });
const stored = () => JSON.parse(localStorage.getItem(NAV_STATE_KEY) ?? "null");
const link = (name: string) => screen.queryByRole("link", { name: new RegExp(`^${name}`) });
const render0 = (pathname = "/", badges: Record<string, number> = {}, onNavigate?: () => void) => {
  const user = userEvent.setup();
  const view = render(<SidebarNav pathname={pathname} badges={badges} onNavigate={onNavigate} />);
  return { user, view, rerender: (p: string) => view.rerender(<SidebarNav pathname={p} badges={badges} onNavigate={onNavigate} />) };
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SidebarNav", () => {
  it("shows five labelled groups, all expanded, with every menu item linking to its page", () => {
    render0();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(GROUPS);
    for (const g of GROUPS) expect(heading(g).getAttribute("aria-expanded")).toBe("true");
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)));
    expect(links).toHaveLength(15);
    for (const g of GROUPS) expect(heading(g).getAttribute("aria-controls")).toBeTruthy();
    expect(document.getElementById(heading("Overview").getAttribute("aria-controls") as string)).toBeTruthy();
  });

  it("collapses and expands a group on click, and saves the choice", async () => {
    const { user } = render0();
    await user.click(heading("Task & Planning"));
    expect(heading("Task & Planning").getAttribute("aria-expanded")).toBe("false");
    for (const name of ["My Tasks", "Brain Dump", "Projects", "Kanban Board", "Calendar"]) expect(link(name)).toBeNull();
    expect(link("Dashboard")).toBeTruthy(); // other groups are untouched
    expect(stored()).toEqual(["planning"]);
    await user.click(heading("Task & Planning"));
    expect(heading("Task & Planning").getAttribute("aria-expanded")).toBe("true");
    expect(link("Calendar")).toBeTruthy();
    expect(stored()).toEqual([]);
  });

  it("remembers collapsed groups after a reload", () => {
    localStorage.setItem(NAV_STATE_KEY, JSON.stringify(["work", "insights"]));
    render0();
    expect(["Overview", "Task & Planning", "Work Management", "Insights & Reports", "System"].map((g) => heading(g).getAttribute("aria-expanded"))).toEqual(["true", "true", "false", "false", "true"]);
    expect(link("UAT Tracker")).toBeNull();
    expect(link("Weekly Report")).toBeNull();
  });

  it("always opens the group of the page you are on, even if you had collapsed it, and keeps the other choices", () => {
    localStorage.setItem(NAV_STATE_KEY, JSON.stringify(["overview", "planning"]));
    render0("/tasks/abc");
    expect(heading("Task & Planning").getAttribute("aria-expanded")).toBe("true");
    expect(heading("Overview").getAttribute("aria-expanded")).toBe("false");
    expect(link("My Tasks")?.getAttribute("aria-current")).toBe("page");
    expect(stored()).toEqual(["overview"]);
  });

  it("opens a collapsed group when you navigate into it", async () => {
    const { user, rerender } = render0("/");
    await user.click(heading("Work Management"));
    expect(link("UAT Tracker")).toBeNull();
    rerender("/uat/123");
    expect(heading("Work Management").getAttribute("aria-expanded")).toBe("true");
    expect(link("UAT Tracker")?.getAttribute("aria-current")).toBe("page");
    expect(stored()).toEqual([]);
  });

  it("a collapsed group that holds the current page still says so", async () => {
    const { user } = render0("/tasks");
    await user.click(heading("Task & Planning"));
    expect(link("My Tasks")).toBeNull();
    expect(screen.getByRole("img", { name: "Contains the current page" })).toBeTruthy();
    await user.click(heading("Task & Planning"));
    expect(screen.queryByRole("img", { name: "Contains the current page" })).toBeNull();
  });

  it("keeps reminder badges: on each item, and added up on a collapsed group", async () => {
    const { user } = render0("/", { "/uat": 1, "/issues": 2, "/waiting": 4 });
    expect(screen.getByLabelText("4 reminders")).toBeTruthy();
    expect(link("Waiting & Blocked")?.textContent).toContain("4");
    await user.click(heading("Work Management"));
    expect(screen.getByLabelText("7 reminders")).toBeTruthy(); // the group heading now carries the total
    expect(screen.getByLabelText("4 reminders").closest("[aria-hidden='true']")).not.toBeNull(); // the item's own badge is tucked away with its group
  });

  it("marks only the current page, including its sub-pages, and nothing for pages outside the menu", () => {
    const { view } = render0("/settings/data");
    expect(screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current")).map((l) => l.textContent)).toEqual(["Settings"]);
    view.rerender(<SidebarNav pathname="/search" badges={{}} />);
    expect(screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current"))).toHaveLength(0);
  });

  it("closes the mobile drawer when a link is chosen", async () => {
    const onNavigate = vi.fn();
    const { user } = render0("/", {}, onNavigate);
    document.addEventListener("click", (e) => e.preventDefault(), { once: true });
    await user.click(link("Analytics") as HTMLElement);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("puts Settings last, in its own separated group", () => {
    render0();
    const buttons = screen.getAllByRole("button");
    expect(buttons[buttons.length - 1].textContent).toBe("System");
    expect(buttons[buttons.length - 1].parentElement?.className).toContain("mt-auto");
    expect(buttons[buttons.length - 1].parentElement?.className).toContain("border-t");
  });

  it("copes with damaged or blocked storage", async () => {
    localStorage.setItem(NAV_STATE_KEY, "{{{ not json");
    const first = render0();
    expect(GROUPS.every((g) => heading(g).getAttribute("aria-expanded") === "true")).toBe(true);
    first.view.unmount();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const { user } = render0();
    await user.click(heading("Overview")); // still works for this visit
    expect(heading("Overview").getAttribute("aria-expanded")).toBe("false");
  });
});
