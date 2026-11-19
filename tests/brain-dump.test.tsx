// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const applyBrainDump = vi.fn();
const saveRoutine = vi.fn();
const push = vi.fn();
vi.mock("@/actions/tasks", () => ({ applyBrainDump: (...a: unknown[]) => applyBrainDump(...a) }));
vi.mock("@/actions/capture", () => ({ saveRoutine: (...a: unknown[]) => saveRoutine(...a) }));
vi.mock("@/actions/engine", () => ({ recordFollowUp: vi.fn(), overrideNextAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BrainDump } from "@/components/brain-dump";
import type { KnownData } from "@/lib/brain-plan";
import { toast } from "sonner";

const baseKnown: KnownData = {
  projects: [{ id: "p1", name: "UAT Booking" }, { id: "p2", name: "HSE Portal" }],
  tasks: [
    { id: "t1", code: "TP-0001", title: "Review PRD v2", status: "To Do", projectId: null, progress: 0, priority: "Medium", dueDate: "", followUpDate: "", estimatedMinutes: null, nextAction: "", waitingFor: "", blocker: "", tags: [] },
    { id: "t2", code: "TP-0002", title: "Sent weekly report to Budi", status: "Done", projectId: null, progress: 100, priority: "Medium", dueDate: "", followUpDate: "", estimatedMinutes: null, nextAction: "", waitingFor: "", blocker: "", tags: [] },
  ],
  people: ["Andi", "Budi Santoso"],
  tags: ["uat"],
};
const setup = (props: { known?: KnownData; routine?: string; recent?: string[] } = {}) => {
  const user = userEvent.setup();
  render(<BrainDump known={props.known ?? baseKnown} routine={props.routine ?? ""} recentTitles={props.recent ?? []} />);
  const area = screen.getByLabelText("One line per activity") as HTMLTextAreaElement;
  const dump = async (text: string) => { await user.click(area); await user.paste(text); };
  return { user, area, dump };
};
const created = (n: number) => ({ ok: true, data: { rows: Array.from({ length: n }, (_, index) => ({ index, kind: "created", id: `n${index}`, code: `TP-01${index}`, title: "x" })), newProjects: [] } });
const select = (name: string) => screen.getByLabelText(name) as HTMLSelectElement;

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Brain Dump: parsing and saving", () => {
  it("turns pasted lines into a preview and saves them all with one click", async () => {
    applyBrainDump.mockResolvedValue(created(3));
    const { user, dump, area } = setup();
    await dump("Follow up Andi tomorrow !h @booking ~15m\n[x] Sent report to Budi quickly\ndoing: Review notes %40");
    expect(await screen.findByRole("button", { name: "Create 3 tasks" })).toBeTruthy();
    expect((screen.getByLabelText("Title for line 1") as HTMLInputElement).value).toBe("Follow up Andi");
    expect(select("Project for line 1").value).toBe("p1");
    expect(select("Priority for line 1").value).toBe("High");
    expect((screen.getByLabelText("Estimate in hours for line 1") as HTMLInputElement).value).toBe("0.25");
    expect(select("Status for line 2").value).toBe("Done");
    expect(select("Status for line 3").value).toBe("In Progress");
    await user.click(screen.getByRole("button", { name: "Create 3 tasks" }));
    await waitFor(() => expect(applyBrainDump).toHaveBeenCalledTimes(1));
    const sent = applyBrainDump.mock.calls[0][0];
    expect(sent.map((r: { kind: string }) => r.kind)).toEqual(["create", "create", "create"]);
    expect(sent[0].values).toMatchObject({ title: "Follow up Andi", projectId: "p1", priority: "High", estimatedHours: "0.25" });
    expect(sent[1].values).toMatchObject({ status: "Done", progress: "100" });
    await waitFor(() => expect(area.value).toBe(""));
    expect(toast.success).toHaveBeenCalled();
  });

  it("lets you fix a row in the preview before saving", async () => {
    applyBrainDump.mockResolvedValue(created(1));
    const { user, dump } = setup();
    await dump("Write PRD");
    const title = screen.getByLabelText("Title for line 1");
    await user.clear(title);
    await user.type(title, "Write PRD for finance");
    await user.selectOptions(select("Priority for line 1"), "Critical");
    await user.click(screen.getByRole("button", { name: "Create 1 task" }));
    await waitFor(() => expect(applyBrainDump).toHaveBeenCalled());
    expect(applyBrainDump.mock.calls[0][0][0].values).toMatchObject({ title: "Write PRD for finance", priority: "Critical" });
  });

  it("a blocked line without a reason is held back, and unlocks once fixed", async () => {
    const { user, dump } = setup();
    await dump("Write contract\nblocked: Vendor onboarding");
    expect(await screen.findByRole("button", { name: "Create 1 task" })).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toMatch(/blocking this task/i);
    await user.type(screen.getByLabelText("Blocker for line 2"), "Contract not signed");
    expect(await screen.findByRole("button", { name: "Create 2 tasks" })).toBeTruthy();
  });

  it("'Already done' applies to every plain line", async () => {
    const { user, dump } = setup();
    await user.click(screen.getByRole("button", { name: "Already done" }));
    await dump("Standup\nChecked dashboard");
    expect(select("Status for line 1").value).toBe("Done");
    expect(select("Status for line 2").value).toBe("Done");
  });

  it("keeps the lines that could not be saved, with the reason; a server error leaves everything in place", async () => {
    applyBrainDump.mockResolvedValueOnce({ ok: true, data: { rows: [{ index: 0, kind: "created", id: "a", code: "TP-1", title: "A" }, { index: 1, error: "That project no longer exists" }], newProjects: [] } });
    const { user, dump, area } = setup();
    await dump("Task A\nTask B");
    await user.click(await screen.findByRole("button", { name: "Create 2 tasks" }));
    await waitFor(() => expect(area.value).toBe("Task B"));
    expect(await screen.findByText("That project no longer exists")).toBeTruthy();
    applyBrainDump.mockResolvedValueOnce({ ok: false, error: "Could not save your change: disk full" });
    await user.type(screen.getByLabelText("Title for line 1"), " again"); // editing a row clears its old error
    await user.type(area, "{Control>}{Enter}{/Control}");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not save your change: disk full"));
    expect(area.value).toContain("Task B");
  });

  it("restores an unsent draft, and offers the routine and often-used titles", async () => {
    localStorage.setItem("taskpilot.brain-dump.draft", "Unfinished idea");
    const { user, area } = setup({ routine: "Daily standup\nCheck UAT dashboard", recent: ["Weekly report"] });
    await waitFor(() => expect(area.value).toBe("Unfinished idea"));
    await user.click(screen.getByRole("button", { name: /Add my daily routine/ }));
    expect(area.value).toBe("Unfinished idea\nDaily standup\nCheck UAT dashboard");
    await user.click(screen.getByRole("button", { name: "Weekly report" }));
    expect(area.value.endsWith("\nWeekly report")).toBe(true);
  });
});

describe("Brain Dump: smart matching", () => {
  it("finds the project through typos, even when it is only mentioned in the words", async () => {
    const { dump } = setup();
    await dump("Retst bokking cases tommorow");
    expect(select("Project for line 1").value).toBe("p1");
    expect(await screen.findByText(/Project \(guessed from the text\): UAT Booking/)).toBeTruthy();
    expect(screen.getByText(/Typo fixed: tommorow → tomorrow/)).toBeTruthy();
    expect(select("Priority for line 1").value).toBe("Medium");
    expect((screen.getByLabelText("Due date for line 1") as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("an @project with a typo is matched and says so; a close call is only a suggestion", async () => {
    const { user, dump } = setup();
    await dump("Check cases @bokking\nOther thing @bokin");
    expect(select("Project for line 1").value).toBe("p1");
    expect(await screen.findByText(/matched from @bokking/)).toBeTruthy();
    expect(select("Project for line 2").value).toBe("");
    await user.click(screen.getByRole("button", { name: "Use it" }));
    expect(select("Project for line 2").value).toBe("p1");
  });

  it("names and tags snap to the ones you already use", async () => {
    const { dump } = setup();
    await dump("API fix >andy #uat");
    expect((screen.getByLabelText("Waiting for, line 1") as HTMLInputElement).value).toBe("Andi");
    expect(select("Status for line 1").value).toBe("Waiting for Others");
    expect(await screen.findByText(/matched from andy/)).toBeTruthy();
  });

  it("a line about a task that already exists UPDATES it instead of creating a duplicate", async () => {
    applyBrainDump.mockResolvedValue({ ok: true, data: { rows: [{ index: 0, kind: "updated", id: "t1", code: "TP-0001", title: "Review PRD v2" }], newProjects: [] } });
    const { user, dump } = setup();
    await dump("[x] revew PRD v2");
    expect(select("Action for line 1").value).toBe("update:t1");
    expect(await screen.findByText(/Matches TP-0001/)).toBeTruthy();
    expect(screen.getByText(/Will change: Status → Done/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Update 1 task" }));
    await waitFor(() => expect(applyBrainDump).toHaveBeenCalledTimes(1));
    expect(applyBrainDump.mock.calls[0][0]).toEqual([{ kind: "update", taskId: "t1", patch: { status: "Done" } }]);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("a plain line that already exists is skipped, but you can still choose to create it", async () => {
    const { user, dump } = setup();
    await dump("review the PRD v2");
    expect(select("Action for line 1").value).toBe("skip");
    expect(screen.getByText("Already exists as TP-0001")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Create 0 tasks/ }) as HTMLButtonElement).disabled).toBe(true);
    await user.selectOptions(select("Action for line 1"), "create");
    expect((screen.getByRole("button", { name: "Create 1 task" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("a lookalike is pointed out but not assumed; choosing to update with nothing to change is explained", async () => {
    const { user, dump } = setup();
    await dump("Review PRD");
    expect(select("Action for line 1").value).toBe("create");
    expect(await screen.findByText(/Looks like TP-0001/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Update that one instead" }));
    expect(select("Action for line 1").value).toBe("update:t1");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Nothing would change/);
  });

  it("a project that does not exist yet is created, and the page says so before saving", async () => {
    applyBrainDump.mockResolvedValue({ ok: true, data: { rows: [{ index: 0, kind: "created", id: "n", code: "TP-9", title: "Draft spec" }], newProjects: ["Zeta"] } });
    const { user, dump } = setup();
    await dump("Draft spec @zeta");
    expect(select("Project for line 1").value).toBe("new:Zeta");
    expect((await screen.findByRole("status")).textContent).toContain("will be created: Zeta");
    await user.click(screen.getByRole("button", { name: "Create 1 task" }));
    await waitFor(() => expect(applyBrainDump).toHaveBeenCalled());
    expect(applyBrainDump.mock.calls[0][0][0].values.projectId).toBe("new:Zeta");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("1 new project"), expect.anything()));
  });

  it("mixed paste: some new, some updates", async () => {
    const { dump } = setup();
    await dump("[x] Review PRD v2\nBrand new idea\nSent weekly report to Budi");
    expect(select("Action for line 1").value).toBe("update:t1");
    expect(select("Action for line 2").value).toBe("create");
    expect(select("Action for line 3").value).toBe("skip");
    expect(screen.getByText("Already done as TP-0002")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save changes (1 new, 1 update)" })).toBeTruthy();
  });
});
