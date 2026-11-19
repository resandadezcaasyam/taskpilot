import { describe, expect, it } from "vitest";
import { addDays, dateKey, daysFromToday, dueLabel, parseDateKey, startOfToday, startOfWeek } from "@/lib/dates";

describe("Jakarta date helpers", () => {
  it("uses the Jakarta calendar day, not UTC", () => {
    // 20:00 UTC on 18 Nov is already 03:00 on 19 Nov in Jakarta (UTC+7)
    expect(dateKey(new Date("2026-11-18T20:00:00Z"))).toBe("2026-11-19");
    expect(dateKey(new Date("2026-11-18T16:59:00Z"))).toBe("2026-11-18");
  });

  it("stores date-only values as midnight Jakarta time", () => {
    expect(parseDateKey("2026-11-19").toISOString()).toBe("2026-11-18T17:00:00.000Z");
    expect(startOfToday(new Date("2026-11-19T10:00:00Z")).toISOString()).toBe("2026-11-18T17:00:00.000Z");
  });

  it("recalculates overdue and due-today as the calendar date changes", () => {
    const due = parseDateKey("2026-11-19");
    expect(daysFromToday(due, new Date("2026-11-18T10:00:00Z"))).toBe(1);
    expect(dueLabel(due, new Date("2026-11-19T01:00:00Z"))).toBe("Due today");
    expect(dueLabel(due, new Date("2026-11-20T01:00:00Z"))).toBe("Overdue by 1 day");
    expect(dueLabel(due, new Date("2026-11-22T01:00:00Z"))).toBe("Overdue by 3 days");
  });

  it("starts the week on Monday", () => {
    // 19 Nov 2026 is a Thursday
    expect(dateKey(startOfWeek(new Date("2026-11-19T05:00:00Z")))).toBe("2026-11-16");
    // Sunday 22 Nov still belongs to the week starting Monday 16 Nov
    expect(dateKey(startOfWeek(new Date("2026-11-22T05:00:00Z")))).toBe("2026-11-16");
    expect(dateKey(addDays(startOfToday(new Date("2026-11-19T05:00:00Z")), 7))).toBe("2026-11-26");
  });
});
