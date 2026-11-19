import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildXlsx, type XlsxSheet } from "@/lib/xlsx";

const load = async (bytes: Uint8Array) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  return wb;
};

describe("Excel workbook builder", () => {
  const sheet: XlsxSheet = {
    name: "Tasks",
    columns: ["Task ID", "Title", "Due Date", "Created", "Progress %", "Notes"],
    kinds: { "Due Date": "date", Created: "datetime", "Progress %": "number" },
    rows: [
      { "Task ID": "TP-0001", Title: "=HYPERLINK(\"http://evil\",\"x\")", "Due Date": new Date("2026-11-18T17:00:00Z"), Created: new Date("2026-11-19T03:00:00Z"), "Progress %": 75, Notes: "line1\nline2" },
      { "Task ID": "TP-0002", Title: "+1 and @mention", "Due Date": null, Created: new Date("2026-11-19T03:00:00Z"), "Progress %": 0, Notes: "x".repeat(40_000) },
    ],
  };

  it("produces a valid .xlsx (a zip) that reads back correctly", async () => {
    const bytes = await buildXlsx([sheet]);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
    const ws = (await load(bytes)).getWorksheet("Tasks")!;
    expect(ws.rowCount).toBe(3);
    expect(ws.getRow(1).values).toEqual([undefined, "Task ID", "Title", "Due Date", "Created", "Progress %", "Notes"]);
    expect(ws.getCell("A2").value).toBe("TP-0001");
  });

  it("uses real Excel dates: date-only values keep their calendar day, timestamps show app-timezone wall-clock time", async () => {
    const ws = (await load(await buildXlsx([sheet]))).getWorksheet("Tasks")!;
    const due = ws.getCell("C2").value as Date;
    expect(due).toBeInstanceOf(Date);
    expect(due.toISOString()).toBe("2026-11-19T00:00:00.000Z"); // 19 Nov in Jakarta, no off-by-one
    expect(ws.getCell("C2").numFmt).toBe("yyyy-mm-dd");
    const created = ws.getCell("D2").value as Date;
    expect(created.toISOString()).toBe("2026-11-19T10:00:00.000Z"); // 10:00 Jakarta shown as 10:00
    expect(ws.getCell("D2").numFmt).toBe("yyyy-mm-dd hh:mm");
    expect(ws.getCell("C3").value).toBeNull(); // empty stays empty
    expect(typeof ws.getCell("E2").value).toBe("number");
  });

  it("text that looks like a formula is stored as text and can never run", async () => {
    const ws = (await load(await buildXlsx([sheet]))).getWorksheet("Tasks")!;
    for (const addr of ["B2", "B3"]) {
      const c = ws.getCell(addr);
      expect(typeof c.value).toBe("string");
      expect(c.type).toBe(ExcelJS.ValueType.String);
      expect(c.formula).toBeUndefined();
    }
    expect(ws.getCell("B2").value).toBe('=HYPERLINK("http://evil","x")');
  });

  it("is practical to use: frozen bold header, filter, bounded widths, oversized cells trimmed", async () => {
    const ws = (await load(await buildXlsx([sheet]))).getWorksheet("Tasks")!;
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.autoFilter).toBeTruthy();
    for (let i = 1; i <= 6; i++) {
      const w = ws.getColumn(i).width ?? 0;
      expect(w).toBeGreaterThanOrEqual(8);
      expect(w).toBeLessThanOrEqual(60);
    }
    expect(String(ws.getCell("F3").value).length).toBeLessThanOrEqual(32_000);
  });

  it("cleans sheet names, de-duplicates them, and keeps empty sheets openable", async () => {
    const wb = await load(await buildXlsx([
      { name: "Issues/Updates: [all]?", columns: ["A"], kinds: {}, rows: [] },
      { name: "Issues Updates  all", columns: ["A"], kinds: {}, rows: [{ A: 1 }] },
      { name: "x".repeat(50), columns: ["A"], kinds: {}, rows: [] },
    ]));
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toHaveLength(3);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(3);
    expect(names.every((n) => n.length <= 31 && !/[[\]:*?/\\]/.test(n))).toBe(true);
    expect(wb.worksheets[0].rowCount).toBe(1); // header only
  });
});
