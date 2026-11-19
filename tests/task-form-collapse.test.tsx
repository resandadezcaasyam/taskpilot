// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const createTask = vi.fn();
vi.mock("@/actions/tasks", () => ({ createTask: (...a: unknown[]) => createTask(...a), updateTask: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TaskFormDialog } from "@/components/task-form-dialog";
import { EMPTY_TASK_FORM } from "@/lib/task-form";
import type { TaskRow } from "@/lib/queries";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const details = () => document.querySelector("details") as HTMLDetailsElement;

describe("the full task form keeps the extra fields optional and out of the way", () => {
  it("a new task only asks for the essentials; the rest is collapsed", async () => {
    createTask.mockResolvedValue({ ok: true, data: { id: "t" } });
    const user = userEvent.setup();
    render(<TaskFormDialog open onOpenChange={() => {}} projects={[]} />);
    expect(details().open).toBe(false);
    expect(screen.getByText("More details (all optional)")).toBeTruthy();
    await user.type(screen.getByLabelText("Title"), "Just a title");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    expect(createTask.mock.calls[0][0]).toMatchObject({ title: "Just a title", status: "To Do", priority: "Medium", estimatedHours: "", tags: "" });
  });

  it("opens the optional section by itself when something inside it needs fixing", async () => {
    const user = userEvent.setup();
    render(<TaskFormDialog open onOpenChange={() => {}} projects={[]} />);
    await user.type(screen.getByLabelText("Title"), "Has a typo");
    await user.type(screen.getByLabelText("Estimated effort (hours)"), "abc");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByText("Enter a positive number")).toBeTruthy();
    expect(details().open).toBe(true);
    expect(createTask).not.toHaveBeenCalled();
  });

  it("editing an existing task shows everything", () => {
    const task = { ...EMPTY_TASK_FORM, id: "x", seq: 1, title: "Existing", description: null, projectId: null, startDate: null, dueDate: null, assignee: null, stakeholder: null, estimatedMinutes: null, actualMinutes: null, progress: 0, businessImportance: 3, nextAction: null, nextActionDue: null, blockerDescription: null, waitingFor: null, followUpDate: null, notes: null, tags: [] } as unknown as TaskRow;
    render(<TaskFormDialog open onOpenChange={() => {}} projects={[]} task={task} />);
    expect(details().open).toBe(true);
  });
});
