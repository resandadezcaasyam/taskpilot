// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXAMPLE_CONFIG, EXAMPLE_SECTIONS, EXAMPLE_TEXT } from "./fixtures/weekly-example";

const saveWeeklyConfig = vi.fn();
vi.mock("@/actions/weekly", () => ({ saveWeeklyConfig: (...a: unknown[]) => saveWeeklyConfig(...a) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { WeeklyReport } from "@/components/weekly-report";
import { weekInfo, type WeeklyDraft, type WeeklyItem } from "@/lib/weekly";
import { toast } from "sonner";

const item = (kind: WeeklyItem["kind"], i: number, text: string, included = true): WeeklyItem => ({ id: `${kind}-${i}`, kind, ref: `TP-000${i}`, text, included, source: "task" });
const draft: WeeklyDraft = {
  info: weekInfo("2026-08-17"),
  planStartKey: "2026-08-17",
  done: EXAMPLE_SECTIONS.done.map((t, i) => item("done", i, t)),
  plan: [...EXAMPLE_SECTIONS.plan.map((t, i) => item("plan", i, t)), item("plan", 9, "Extra idea — planned", false)],
  blocked: EXAMPLE_SECTIONS.blocked.map((t, i) => item("blocked", i, t)),
};
const setup = (cfg = EXAMPLE_CONFIG) => {
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true }); // user-event installs its own stub, so ours goes on top
  render(<WeeklyReport draft={draft} config={cfg} displayName="Resanda" prevKey="2026-08-10" nextKey="2026-08-24" defaultKey="2026-08-17" />);
  return { user, preview: () => screen.getByTestId("email-preview").textContent };
};
const clipboard = { write: vi.fn(), writeText: vi.fn() };
class FakeClipboardItem { constructor(public data: Record<string, Blob>) {} }

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
  (globalThis as unknown as { ClipboardItem: unknown }).ClipboardItem = FakeClipboardItem;
  clipboard.write.mockResolvedValue(undefined);
  clipboard.writeText.mockResolvedValue(undefined);
  saveWeeklyConfig.mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Weekly Report page", () => {
  it("shows the week and the finished email, identical to the hand-written one", () => {
    const { preview } = setup();
    expect(preview()).toBe(EXAMPLE_TEXT);
    expect(screen.getAllByText(/Aug Week 3/).length).toBeGreaterThan(0);
    expect(screen.getByText("Weekly Plan Resanda — Aug Week 3")).toBeTruthy();
    expect(screen.getByText("7 lines in the email")).toBeTruthy();
  });

  it("lets you leave a line out, reword one, and add your own", async () => {
    const { user, preview } = setup();
    await user.click(screen.getByLabelText("Include Done last week item 2"));
    expect(preview()).not.toContain("Ad-hoc Rule Improvement");
    const field = screen.getByLabelText("This week item 3");
    await user.clear(field);
    await user.type(field, "Fleet Maintenance — in progress (90%), ekspektasi selesai Kamis");
    expect(preview()).toContain("- Fleet Maintenance — in progress (90%), ekspektasi selesai Kamis");
    await user.click(screen.getByLabelText("Include This week item 4")); // the unticked extra idea
    expect(preview()).toContain("- Extra idea — planned");
    await user.click(screen.getAllByRole("button", { name: /Add a line/ })[2]);
    await user.type(screen.getByLabelText("Blocked / At risk item 3"), "Waiting for legal sign-off");
    expect(preview()).toContain("- Waiting for legal sign-off");
    await user.click(screen.getByLabelText("Remove Blocked / At risk item 3"));
    expect(preview()).not.toContain("legal sign-off");
  });

  it("an emptied section says so instead of leaving a bare heading", async () => {
    const { user, preview } = setup();
    await user.click(screen.getByLabelText("Include Blocked / At risk item 1"));
    await user.click(screen.getByLabelText("Include Blocked / At risk item 2"));
    expect(preview()).toContain("Blocked / At risk:\n- Tidak ada\n");
  });

  it("the extra Product Dash line can be changed or left out", async () => {
    const { user, preview } = setup();
    await user.selectOptions(screen.getByLabelText("Product Dash updated"), "No");
    expect(preview()).toContain("Product Dash updated: No");
    await user.selectOptions(screen.getByLabelText("Product Dash updated"), "Skip");
    expect(preview()).not.toContain("Product Dash");
  });

  it("subject can be edited and reset; recipients and names flow into the email", async () => {
    const { user, preview } = setup();
    const subject = screen.getByDisplayValue("Weekly Plan Resanda — Aug Week 3");
    await user.clear(subject);
    await user.type(subject, "Custom subject");
    expect(screen.getByText("Custom subject", { selector: "dd" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("Weekly Plan Resanda — Aug Week 3", { selector: "dd" })).toBeTruthy();
    const names = screen.getByLabelText("Greet (names)");
    await user.clear(names);
    await user.type(names, "Mas Ari");
    expect(preview()?.startsWith("Hi Mas Ari,\n")).toBe(true);
  });

  it("'Copy email' puts a formatted version and a plain-text version on the clipboard", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /Copy email/ }));
    await waitFor(() => expect(clipboard.write).toHaveBeenCalledTimes(1));
    const data = (clipboard.write.mock.calls[0][0][0] as FakeClipboardItem).data;
    expect(Object.keys(data).sort()).toEqual(["text/html", "text/plain"]);
    expect(data["text/plain"].size).toBe(new TextEncoder().encode(EXAMPLE_TEXT).length);
    expect(data["text/html"].size).toBeGreaterThan(data["text/plain"].size / 2);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("falls back to plain text where rich copy is unavailable, and can copy just the subject", async () => {
    const { user } = setup();
    delete (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem;
    await user.click(screen.getByRole("button", { name: /Copy email/ }));
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith(EXAMPLE_TEXT));
    await user.click(screen.getByRole("button", { name: "Copy subject" }));
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith("Weekly Plan Resanda — Aug Week 3"));
  });

  it("opens the email app with the subject and body, using only real email addresses", async () => {
    const { user } = setup();
    let href = screen.getByRole("link", { name: /Open in email app/ }).getAttribute("href") ?? "";
    expect(href.startsWith("mailto:?")).toBe(true); // "Hizky, Adhyan" are names, not addresses
    expect(href).toContain(`subject=${encodeURIComponent("Weekly Plan Resanda — Aug Week 3")}`);
    expect(decodeURIComponent(href.split("body=")[1])).toBe(EXAMPLE_TEXT.replace(/\n/g, "\r\n"));
    await user.clear(screen.getByLabelText("To"));
    await user.type(screen.getByLabelText("To"), "a@spx.com, b@spx.com");
    await user.type(screen.getByLabelText("Cc"), "c@spx.com");
    href = screen.getByRole("link", { name: /Open in email app/ }).getAttribute("href") ?? "";
    expect(href.startsWith("mailto:a@spx.com, b@spx.com?") || href.startsWith("mailto:a@spx.com,%20b@spx.com?") || href.startsWith("mailto:a@spx.com, b@spx.com?")).toBe(true);
    expect(href).toContain("cc=c%40spx.com");
  });

  it("saves the template as the default, with every edit, and reports a failed save", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Cc"), "boss@spx.com");
    await user.click(screen.getByText("Template settings"));
    await user.click(screen.getByRole("button", { name: "Save as my default" }));
    await waitFor(() => expect(saveWeeklyConfig).toHaveBeenCalledTimes(1));
    expect(saveWeeklyConfig.mock.calls[0][0]).toMatchObject({ cc: "boss@spx.com", greetingNames: "Mas Hizky, Mas Ari", headingPlan: "This week", signature: EXAMPLE_CONFIG.signature });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    saveWeeklyConfig.mockResolvedValueOnce({ ok: false, error: "Signature is too long" });
    await user.click(screen.getByRole("button", { name: "Save as my default" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Signature is too long"));
  });

  it("template wording changes the email, and the week links point to the neighbouring weeks", async () => {
    const { user, preview } = setup();
    await user.click(screen.getByText("Template settings"));
    const heading = screen.getByLabelText("Heading: plan");
    await user.clear(heading);
    await user.type(heading, "Next week");
    expect(preview()).toContain("Next week:\n- New linehaul");
    expect(screen.getByRole("link", { name: /Previous week/ }).getAttribute("href")).toBe("/weekly?week=2026-08-10");
    expect(screen.getByRole("link", { name: /Next week$/ }).getAttribute("href")).toBe("/weekly?week=2026-08-24");
    expect(screen.getByRole("link", { name: "Auto" }).getAttribute("href")).toBe("/weekly");
  });
});
