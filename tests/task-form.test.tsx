// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const createTask = vi.fn();
const updateTask = vi.fn();
vi.mock("@/actions/tasks", () => ({ createTask: (...a: unknown[]) => createTask(...a), updateTask: (...a: unknown[]) => updateTask(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TaskFormDialog } from "@/components/task-form-dialog";
import { toast } from "sonner";

const projects = [{ id: "p1", name: "UAT Booking" }];
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TaskFormDialog", () => {
  it("blocks an empty title and shows a clear error without calling the server", async () => {
    const user = userEvent.setup();
    render(<TaskFormDialog open onOpenChange={() => {}} projects={projects} />);
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByText("Title is required")).toBeTruthy();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("submits a valid task and closes", async () => {
    createTask.mockResolvedValue({ ok: true, data: { id: "t1" } });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<TaskFormDialog open onOpenChange={onOpenChange} projects={projects} />);
    await user.type(screen.getByLabelText("Title"), "Follow up with engineering");
    await user.type(screen.getByLabelText("Due date"), "2026-11-20");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    expect(createTask.mock.calls[0][0]).toMatchObject({ title: "Follow up with engineering", dueDate: "2026-11-20", status: "To Do", priority: "Medium", progress: "0" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("shows a failed write instead of silently closing", async () => {
    createTask.mockResolvedValue({ ok: false, error: "Could not save your change: disk full" });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<TaskFormDialog open onOpenChange={onOpenChange} projects={projects} />);
    await user.type(screen.getByLabelText("Title"), "Will fail");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not save your change: disk full"));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("requires a blocker description when status is Blocked", async () => {
    const user = userEvent.setup();
    render(<TaskFormDialog open onOpenChange={() => {}} projects={projects} />);
    await user.type(screen.getByLabelText("Title"), "Vendor compliance");
    await user.selectOptions(screen.getByLabelText("Status"), "Blocked");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByText("Describe what is blocking this task")).toBeTruthy();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("quick variant only shows the essentials", () => {
    render(<TaskFormDialog open onOpenChange={() => {}} projects={projects} variant="quick" />);
    expect(screen.getByLabelText("Title")).toBeTruthy();
    expect(screen.getByLabelText("Next action")).toBeTruthy();
    expect(screen.queryByLabelText("Description")).toBeNull();
    expect(screen.queryByLabelText("Status")).toBeNull();
  });
});
