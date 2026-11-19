// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const createTask = vi.fn();
const previewRestore = vi.fn();
const restoreBackup = vi.fn();
const saveEngineSettings = vi.fn();
vi.mock("@/actions/tasks", () => ({ createTask: (...a: unknown[]) => createTask(...a), updateTask: vi.fn() }));
vi.mock("@/actions/backup", () => ({
  previewRestore: (...a: unknown[]) => previewRestore(...a), restoreBackup: (...a: unknown[]) => restoreBackup(...a),
  createBackupNow: vi.fn(), removeBackupFile: vi.fn(),
}));
vi.mock("@/actions/settings", () => ({ saveEngineSettings: (...a: unknown[]) => saveEngineSettings(...a), resetEngineSettings: vi.fn(), saveThemePreference: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RestoreWizard } from "@/components/data-tools";
import { SettingsForm } from "@/components/settings-form";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { toast } from "sonner";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Quick Capture in the Quick Add dialog", () => {
  it("turns one sentence into a structured form, then saves it", async () => {
    createTask.mockResolvedValue({ ok: true, data: { id: "t1" } });
    const user = userEvent.setup();
    render(<TaskFormDialog open onOpenChange={() => {}} projects={[]} variant="quick" />);
    await user.type(screen.getByLabelText("Describe it in one sentence"), "Follow up with engineering about the API issue 2026-12-01 urgent{Enter}");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Follow up with engineering about the API issue");
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe("Stakeholder Follow-up");
    expect((screen.getByLabelText("Priority") as HTMLSelectElement).value).toBe("High");
    expect((screen.getByLabelText("Follow-up date") as HTMLInputElement).value).toBe("2026-12-01");
    expect((screen.getByLabelText("Next action") as HTMLInputElement).value).toBe("Follow up with engineering about the API issue");
    expect(screen.getByText(/Detected:/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    expect(createTask.mock.calls[0][0]).toMatchObject({ title: "Follow up with engineering about the API issue", followUpDate: "2026-12-01", dueDate: "", category: "Stakeholder Follow-up" });
  });
  it("still works fully by hand when nothing is detected", async () => {
    const user = userEvent.setup();
    render(<TaskFormDialog open onOpenChange={() => {}} projects={[]} variant="quick" />);
    await user.type(screen.getByLabelText("Describe it in one sentence"), "Buy coffee{Enter}");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Buy coffee");
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe("Other");
  });
});

describe("RestoreWizard", () => {
  const report = (over = {}) => ({
    mode: "merge", backupInfo: { exportedAt: "2026-11-19T03:00:00.000Z", appVersion: "0.4.0", schemaVersion: 1, includesFiles: true },
    tables: [{ table: "Task", inBackup: 5, toAdd: 2, identical: 2, differs: 1, skipped: {} }], totals: { inBackup: 5, toAdd: 2, identical: 2, differs: 1, skipped: 0 },
    existingRecords: 9, renumbered: { tasks: 0, issues: 0 }, warnings: [], files: { referenced: 0, availableInBackup: 0 }, ...over,
  });
  const pick = (name = "b.json") => userEvent.upload(screen.getByLabelText("Backup file"), new File(["{}"], name, { type: "application/json" }));

  it("previews first; nothing is restored until the user confirms", async () => {
    previewRestore.mockResolvedValue({ ok: true, data: report() });
    restoreBackup.mockResolvedValue({ ok: true, data: { mode: "merge", inserted: { Task: 2 }, totalInserted: 2, renumbered: { tasks: 0, issues: 0 }, snapshot: "pre-restore-x.json", filesRestored: 0, filesMissing: 0 } });
    render(<RestoreWizard />);
    expect((screen.getByRole("button", { name: "Preview what will happen" }) as HTMLButtonElement).disabled).toBe(true);
    await pick();
    await userEvent.click(screen.getByRole("button", { name: "Preview what will happen" }));
    expect(await screen.findByText("Will be added")).toBeTruthy();
    expect(screen.getByText(/Different, yours kept/)).toBeTruthy();
    expect(restoreBackup).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Add 2 missing records" }));
    await waitFor(() => expect(restoreBackup).toHaveBeenCalledTimes(1));
    const fd = restoreBackup.mock.calls[0][0] as FormData;
    expect(fd.get("mode")).toBe("merge");
    expect((fd.get("file") as File).name).toBe("b.json");
    expect(await screen.findByText(/Restore complete: 2 records added/)).toBeTruthy();
    expect(screen.getByText("pre-restore-x.json")).toBeTruthy();
  });

  it("replace mode warns about deletion and needs the word REPLACE", async () => {
    previewRestore.mockResolvedValue({ ok: true, data: report({ mode: "replace" }) });
    render(<RestoreWizard />);
    await pick("b.zip");
    await userEvent.click(screen.getByLabelText(/Replace everything/));
    await userEvent.click(screen.getByRole("button", { name: "Preview what will happen" }));
    expect(await screen.findByText(/9 current records will be deleted/)).toBeTruthy();
    const go = screen.getByRole("button", { name: "Replace all data" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    await userEvent.type(screen.getByPlaceholderText("REPLACE"), "replace");
    expect(go.disabled).toBe(true); // case matters
    await userEvent.clear(screen.getByPlaceholderText("REPLACE"));
    await userEvent.type(screen.getByPlaceholderText("REPLACE"), "REPLACE");
    expect(go.disabled).toBe(false);
    expect((previewRestore.mock.calls[0][0] as FormData).get("mode")).toBe("replace");
  });

  it("shows why a file was rejected", async () => {
    previewRestore.mockResolvedValue({ ok: false, error: "This backup was made by a newer TaskPilot." });
    render(<RestoreWizard />);
    await pick();
    await userEvent.click(screen.getByRole("button", { name: "Preview what will happen" }));
    expect((await screen.findByRole("alert")).textContent).toContain("newer TaskPilot");
    expect(screen.queryByRole("button", { name: /Add .* missing records/ })).toBeNull();
  });

  it("changing the mode discards a stale preview", async () => {
    previewRestore.mockResolvedValue({ ok: true, data: report() });
    render(<RestoreWizard />);
    await pick();
    await userEvent.click(screen.getByRole("button", { name: "Preview what will happen" }));
    await screen.findByText("Will be added");
    await userEvent.click(screen.getByLabelText(/Replace everything/));
    expect(screen.queryByText("Will be added")).toBeNull();
  });
});

describe("SettingsForm", () => {
  it("saves display preferences and reports success", async () => {
    saveEngineSettings.mockResolvedValue({ ok: true, data: undefined });
    render(<SettingsForm initial={DEFAULT_SETTINGS} timezone="Asia/Jakarta" aiKeyConfigured={false} />);
    await userEvent.type(screen.getByLabelText("Display name"), "Resanda");
    await userEvent.selectOptions(screen.getByLabelText("Date format"), "yyyy-MM-dd");
    await userEvent.selectOptions(screen.getByLabelText("Default task view"), "cards");
    await userEvent.click(screen.getByLabelText(/Back up automatically/));
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(saveEngineSettings).toHaveBeenCalledTimes(1));
    expect(saveEngineSettings.mock.calls[0][0]).toMatchObject({ displayName: "Resanda", dateFormat: "yyyy-MM-dd", defaultTaskView: "cards", autoBackup: false });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Settings saved"));
  });
  it("shows the fixed timezone read-only and the AI key status without exposing a key", () => {
    render(<SettingsForm initial={DEFAULT_SETTINGS} timezone="Asia/Jakarta" aiKeyConfigured />);
    expect((screen.getByLabelText("Timezone") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/GEMINI_API_KEY is set on the server/)).toBeTruthy();
  });
  it("surfaces a failed save", async () => {
    saveEngineSettings.mockResolvedValue({ ok: false, error: "Could not save your change: disk full" });
    render(<SettingsForm initial={DEFAULT_SETTINGS} timezone="Asia/Jakarta" aiKeyConfigured={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not save your change: disk full"));
  });
});
