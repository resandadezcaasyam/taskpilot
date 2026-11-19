// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const completeNextAction = vi.fn();
const startNow = vi.fn();
vi.mock("@/actions/engine", () => ({
  completeNextAction: (...a: unknown[]) => completeNextAction(...a),
  startNow: (...a: unknown[]) => startNow(...a),
  postponeNextAction: vi.fn(),
  recordFollowUp: vi.fn(),
  overrideNextAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RecActions } from "@/components/rec-actions";
import { toast } from "sonner";

const props = {
  taskId: "t1", taskTitle: "Vendor compliance", status: "To Do", kind: "Do Today", action: "Start working on this today.",
  score: 61, reason: "Due today", overridden: false, pinned: false, followUpDefault: "2026-11-22",
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RecActions", () => {
  it("marks the ACTION complete with its snapshot (never the task)", async () => {
    completeNextAction.mockResolvedValue({ ok: true, data: undefined });
    render(<RecActions {...props} />);
    await userEvent.click(screen.getByRole("button", { name: /mark action complete/i }));
    await waitFor(() => expect(completeNextAction).toHaveBeenCalledWith("t1", { kind: "Do Today", text: "Start working on this today.", score: 61, reason: "Due today" }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("reports a failed save", async () => {
    startNow.mockResolvedValue({ ok: false, error: "Could not save your change: disk full" });
    render(<RecActions {...props} />);
    await userEvent.click(screen.getByRole("button", { name: /start now/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not save your change: disk full"));
  });

  it("offers Start now only for workable tasks", () => {
    const { rerender } = render(<RecActions {...props} status="Blocked" />);
    expect(screen.queryByRole("button", { name: /start now/i })).toBeNull();
    rerender(<RecActions {...props} status="In Progress" />);
    expect(screen.getByRole("button", { name: /add to today/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /follow up/i })).toBeTruthy();
  });
});
