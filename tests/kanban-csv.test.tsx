// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const moveTask = vi.fn();
const importTestCases = vi.fn();
vi.mock("@/actions/tasks", () => ({ moveTask: (...a: unknown[]) => moveTask(...a), createTask: vi.fn(), updateTask: vi.fn() }));
vi.mock("@/actions/uat", () => ({
  importTestCases: (...a: unknown[]) => importTestCases(...a), createTestCase: vi.fn(), updateTestCase: vi.fn(), deleteTestCase: vi.fn(),
  setTestResult: vi.fn(), linkTestCaseIssue: vi.fn(), createIssueFromTestCase: vi.fn(), deleteUatFeature: vi.fn(), markFixDeployed: vi.fn(),
  retestFailed: vi.fn(), setSignOff: vi.fn(), updateUatFeature: vi.fn(), createUatFeature: vi.fn(),
}));
vi.mock("@/actions/attachments", () => ({ addEvidence: vi.fn(), deleteEvidence: vi.fn() }));
vi.mock("@/actions/engine", () => ({ recordFollowUp: vi.fn(), overrideNextAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { KanbanBoard } from "@/components/kanban-board";
import { TestCasesPanel } from "@/components/uat-client";
import type { TaskRow } from "@/lib/queries";
import { toast } from "sonner";

const task = (o: Partial<TaskRow>) =>
  ({ id: "t1", seq: 1, title: "Write release notes", status: "To Do", priority: "Medium", category: "Other", progress: 0, dueDate: null, followUpDate: null,
    blockerDescription: null, waitingFor: null, nextAction: null, description: null, assignee: null, project: null, tags: [], ...o }) as unknown as TaskRow;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("KanbanBoard", () => {
  const card = () => screen.getByText("Write release notes").closest("li") as HTMLElement;
  const column = (name: string) => screen.getByRole("region", { name });

  it("dragging a card to another column saves the new status", async () => {
    moveTask.mockResolvedValue({ ok: true, data: undefined });
    render(<KanbanBoard tasks={[task({})]} projects={[]} />);
    fireEvent.dragStart(card());
    fireEvent.dragOver(column("In Progress"));
    fireEvent.drop(column("In Progress"));
    await waitFor(() => expect(moveTask).toHaveBeenCalledWith("t1", "In Progress", undefined));
    expect(within(column("In Progress")).getByText("Write release notes")).toBeTruthy(); // optimistic move
  });

  it("reverts the card and shows the error when the save fails", async () => {
    moveTask.mockResolvedValue({ ok: false, error: "Could not save your change: disk full" });
    render(<KanbanBoard tasks={[task({})]} projects={[]} />);
    fireEvent.dragStart(card());
    fireEvent.drop(column("In Review"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not save your change: disk full"));
    await waitFor(() => expect(within(column("To Do")).getByText("Write release notes")).toBeTruthy());
  });

  it("asks for the blocker before moving to Blocked, and sends it with the move", async () => {
    moveTask.mockResolvedValue({ ok: true, data: undefined });
    render(<KanbanBoard tasks={[task({})]} projects={[]} />);
    fireEvent.dragStart(card());
    fireEvent.drop(column("Blocked"));
    expect(moveTask).not.toHaveBeenCalled();
    expect(await screen.findByText("What is blocking this task?")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Blocker"), "Backend timestamp missing");
    await userEvent.click(screen.getByRole("button", { name: "Move task" }));
    await waitFor(() => expect(moveTask).toHaveBeenCalledWith("t1", "Blocked", { blockerDescription: "Backend timestamp missing" }));
  });

  it("has a keyboard/touch alternative to dragging", async () => {
    moveTask.mockResolvedValue({ ok: true, data: undefined });
    render(<KanbanBoard tasks={[task({})]} projects={[]} />);
    await userEvent.selectOptions(screen.getByLabelText("Move Write release notes to"), "In Review");
    await waitFor(() => expect(moveTask).toHaveBeenCalledWith("t1", "In Review", undefined));
  });
});

describe("CSV import (UAT)", () => {
  const open = async () => {
    render(<TestCasesPanel featureId="f1" cases={[]} issueOptions={[]} />);
    await userEvent.click(screen.getAllByRole("button", { name: /import csv/i })[0]);
  };
  const upload = (text: string) => {
    const input = document.querySelector('input[accept*=".csv"]') as HTMLInputElement;
    return userEvent.upload(input, new File([text], "cases.csv", { type: "text/csv" }));
  };

  it("previews the file first and only saves after confirmation", async () => {
    importTestCases.mockResolvedValue({ ok: true, data: { created: 2, skipped: 0 } });
    await open();
    await upload("Title,Result,Expected Result\nBook ticket,Pass,Issued\nRefund,Fail,Queued");
    expect(await screen.findByText(/2 test cases ready/)).toBeTruthy();
    expect(importTestCases).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Import 2 test cases" }));
    await waitFor(() => expect(importTestCases).toHaveBeenCalledTimes(1));
    const [featureId, rows] = importTestCases.mock.calls[0];
    expect(featureId).toBe("f1");
    expect(rows.map((r: { title: string; result: string }) => [r.title, r.result])).toEqual([["Book ticket", "Pass"], ["Refund", "Fail"]]);
  });

  it("explains a file without a Title column and disables import", async () => {
    await open();
    await upload("Steps,Result\nx,Pass");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Import 0 test cases/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
