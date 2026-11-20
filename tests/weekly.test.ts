import { describe, expect, it } from "vitest";
import { DEFAULT_WEEKLY_CONFIG, addKeyDays, defaultPlanStartKey, formatEmail, isValidKey, mergeWeeklyConfig, mondayKey, weekInfo, weekLabel, weekdayNameId } from "@/lib/weekly";
import { EXAMPLE_CONFIG, EXAMPLE_SECTIONS, EXAMPLE_TEXT } from "./fixtures/weekly-example";

describe("weeks", () => {
  it("names weeks like the hand-written email: Monday to Sunday, owned by the month of their Thursday", () => {
    const i = weekInfo("2026-08-17");
    expect(i.plan).toMatchObject({ label: "Aug Week 3", month: "Aug", weekNo: 3, range: "17–23 Aug 2026", endKey: "2026-08-23" });
    expect(i.last).toMatchObject({ label: "Aug Week 2", range: "10–16 Aug 2026", startKey: "2026-08-10" });
  });
  it("handles weeks that straddle two months", () => {
    const i = weekInfo("2026-08-31"); // Mon 31 Aug - Sun 6 Sep, Thursday is 3 Sep
    expect(i.plan).toMatchObject({ label: "Sep Week 1", range: "31 Aug – 6 Sep 2026" });
    expect(i.last).toMatchObject({ label: "Aug Week 4", range: "24–30 Aug 2026" });
    expect(weekLabel("2026-12-28").range).toBe("28 Dec – 3 Jan 2027"); // across the new year
  });
  it("picks the week to plan from today's weekday: Mon-Wed this week, Thu-Sun next week", () => {
    expect(defaultPlanStartKey("2026-08-17")).toBe("2026-08-17");
    expect(defaultPlanStartKey("2026-08-18")).toBe("2026-08-17");
    expect(defaultPlanStartKey("2026-08-19")).toBe("2026-08-17");
    expect(defaultPlanStartKey("2026-08-20")).toBe("2026-08-24");
    expect(defaultPlanStartKey("2026-08-23")).toBe("2026-08-24"); // Sunday
  });
  it("date helpers", () => {
    expect(mondayKey("2026-08-23")).toBe("2026-08-17");
    expect(mondayKey("2026-08-17")).toBe("2026-08-17");
    expect(addKeyDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(weekdayNameId("2026-08-19")).toBe("Rabu");
    expect(weekdayNameId("2026-08-21")).toBe("Jumat");
    expect(["2026-02-31", "abc", "2026-8-1", ""].some(isValidKey)).toBe(false);
    expect(isValidKey("2026-08-17")).toBe(true);
  });
});

describe("the email", () => {
  const info = weekInfo("2026-08-17");
  it("reproduces the hand-written weekly email exactly", () => {
    const e = formatEmail(EXAMPLE_CONFIG, info, EXAMPLE_SECTIONS, "Resanda");
    expect(e.text).toBe(EXAMPLE_TEXT);
    expect(e.subject).toBe("Weekly Plan Resanda — Aug Week 3");
    expect(e.to).toBe("Hizky, Adhyan");
  });
  it("also makes a rich version with real bullet lists and escaped text", () => {
    const e = formatEmail(EXAMPLE_CONFIG, info, EXAMPLE_SECTIONS, "Resanda");
    expect(e.html).toContain("<ul><li>Add DG Validation during TO Audit — signed off (100%)</li>");
    expect(e.html).toContain("<li>New linehaul booking &amp; charging scheme");
    expect(e.html).toContain("<p>Regards,<br>Resanda Dezca Asyam<br>SPX Express | Product | ID Product Support</p>");
    expect(formatEmail(EXAMPLE_CONFIG, info, { ...EXAMPLE_SECTIONS, done: ["<b>x</b> & \"y\""] }, "R").html).toContain("<li>&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;</li>");
  });
  it("empty lists say so, blank lines are dropped, and the extra line can be left out", () => {
    const e = formatEmail({ ...EXAMPLE_CONFIG, productDash: "Skip" }, info, { done: [], plan: ["  ", "A"], blocked: [""] }, "R");
    expect(e.text).toContain("Done last week:\n- Tidak ada\n");
    expect(e.text).toContain("This week:\n- A\n");
    expect(e.text).toContain("Blocked / At risk:\n- Tidak ada\n");
    expect(e.text).not.toContain("Product Dash");
    expect(formatEmail({ ...EXAMPLE_CONFIG, productDash: "No" }, info, EXAMPLE_SECTIONS, "R").text).toContain("Product Dash updated: No");
  });
  it("greeting, names and placeholders", () => {
    const base = formatEmail({ ...EXAMPLE_CONFIG, greetingNames: "", senderName: "" }, info, EXAMPLE_SECTIONS, "Resanda D");
    expect(base.text.startsWith("Hi,\n\nBerikut")).toBe(true);
    expect(base.subject).toBe("Weekly Plan Resanda D — Aug Week 3");
    expect(formatEmail({ ...EXAMPLE_CONFIG, greeting: "Dear {names}," }, info, EXAMPLE_SECTIONS, "R").text.startsWith("Dear Mas Hizky, Mas Ari,")).toBe(true);
    expect(formatEmail({ ...EXAMPLE_CONFIG, subject: "{name} {month}/{week}" }, info, EXAMPLE_SECTIONS, "R").subject).toBe("Resanda Aug/3");
    expect(formatEmail({ ...EXAMPLE_CONFIG, intro: "" }, info, EXAMPLE_SECTIONS, "R").text.startsWith("Hi Mas Hizky, Mas Ari,\n\nDone last week")).toBe(false); // an empty intro leaves a blank paragraph, not a crash
  });
  it("names both months in the opening sentence when the weeks are in different months", () => {
    const e = formatEmail(EXAMPLE_CONFIG, weekInfo("2026-08-31"), EXAMPLE_SECTIONS, "R");
    expect(e.text).toContain("Berikut update saya untuk Aug week 4 kemarin, dan plan untuk Sep week 1.");
    expect(e.subject).toBe("Weekly Plan Resanda — Sep Week 1");
  });
});

describe("saved template", () => {
  it("falls back to defaults for anything missing or invalid", () => {
    expect(mergeWeeklyConfig(null)).toEqual(DEFAULT_WEEKLY_CONFIG);
    expect(mergeWeeklyConfig({ to: "a@b.com", productDash: "Maybe" })).toEqual(DEFAULT_WEEKLY_CONFIG); // one bad field rejects the lot
    expect(mergeWeeklyConfig({ to: "a@b.com", greetingNames: "Mas X" })).toMatchObject({ to: "a@b.com", greetingNames: "Mas X", headingDone: "Done last week" });
  });
});
