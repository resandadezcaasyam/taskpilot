import ExcelJS from "exceljs";
import { APP_OFFSET_MINUTES, dateKey } from "./dates";

export type CellKind = "text" | "date" | "datetime" | "number";
export interface XlsxSheet {
  /** Sheet tab name (max 31 characters, none of [ ] : * ? / \). */
  name: string;
  columns: string[];
  kinds: Record<string, CellKind>;
  rows: Record<string, unknown>[];
}

const MAX_CELL = 32_000; // Excel allows 32,767 characters per cell
const safeSheetName = (n: string) => n.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";

/**
 * Builds a real .xlsx workbook: bold frozen header row, filters, sensible column widths, wrapped text, and
 * true Excel dates (not text). Text is always stored as text, so a value like "=1+1" can never run as a formula.
 * Date-only values are written as that calendar day; timestamps are written as wall-clock time in the app timezone.
 */
export async function buildXlsx(sheets: XlsxSheet[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TaskPilot";
  wb.created = new Date();
  const used = new Set<string>();

  for (const sheet of sheets) {
    let name = safeSheetName(sheet.name);
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${safeSheetName(sheet.name).slice(0, 28)} ${i}`;
    used.add(name.toLowerCase());

    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    const widths = sheet.columns.map((c) => c.length + 2);
    ws.addRow(sheet.columns);

    for (const r of sheet.rows) {
      const values = sheet.columns.map((c, i) => {
        const kind = sheet.kinds[c] ?? "text";
        const v = r[c];
        if (v === null || v === undefined || v === "") return null;
        if (kind === "date" && v instanceof Date) return new Date(`${dateKey(v)}T00:00:00Z`);
        if (kind === "datetime" && v instanceof Date) return new Date(v.getTime() + APP_OFFSET_MINUTES * 60_000);
        if (kind === "number" || typeof v === "number") return typeof v === "number" ? v : Number(v);
        const text = v instanceof Date ? v.toISOString() : String(v);
        widths[i] = Math.max(widths[i], Math.min(text.split("\n")[0].length + 2, 60));
        return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL - 1)}…` : text;
      });
      ws.addRow(values);
    }

    sheet.columns.forEach((c, i) => {
      const kind = sheet.kinds[c] ?? "text";
      const col = ws.getColumn(i + 1);
      col.width = kind === "date" ? 12 : kind === "datetime" ? 17 : kind === "number" ? Math.max(10, widths[i]) : Math.min(60, Math.max(10, widths[i]));
      if (kind === "date") col.numFmt = "yyyy-mm-dd";
      if (kind === "datetime") col.numFmt = "yyyy-mm-dd hh:mm";
      if (kind === "text") col.alignment = { vertical: "top", wrapText: true };
    });

    const header = ws.getRow(1);
    header.font = { bold: true };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EAF6" } };
    header.alignment = { vertical: "middle", wrapText: false };
    header.height = 20;
    if (sheet.columns.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
