/** Small RFC-4180 style CSV reader plus the UAT test-case column mapping. Pure, no dependencies. */

export function detectDelimiter(firstLine: string): string {
  const count = (ch: string) => {
    let n = 0;
    let quoted = false;
    for (const c of firstLine) {
      if (c === '"') quoted = !quoted;
      else if (!quoted && c === ch) n++;
    }
    return n;
  };
  // Excel in many locales (including Indonesian) exports semicolon-separated files.
  const candidates: [string, number][] = [[",", count(",")], [";", count(";")], ["\t", count("\t")]];
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][1] > 0 ? candidates[0][0] : ",";
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0] ?? "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) endField();
    else if (ch === "\n") endRow();
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

export const TEST_RESULTS = ["Pass", "Fail", "Blocked", "Not Run"] as const;
export type TestResult = (typeof TEST_RESULTS)[number];

export interface ParsedCase {
  title: string;
  prerequisites: string;
  steps: string;
  expectedResult: string;
  actualResult: string;
  result: TestResult;
  remarks: string;
  linkedBug: string;
}

const ALIASES: Record<keyof Omit<ParsedCase, "result"> | "result", string[]> = {
  title: ["title", "testcase", "testcasetitle", "name", "testname", "case", "scenario", "testscenario"],
  prerequisites: ["prerequisites", "prerequisite", "preconditions", "precondition"],
  steps: ["steps", "teststeps", "step"],
  expectedResult: ["expectedresult", "expected", "expectedoutcome"],
  actualResult: ["actualresult", "actual", "actualoutcome"],
  result: ["result", "status", "testresult"],
  remarks: ["remarks", "remark", "notes", "note", "comments"],
  linkedBug: ["bug", "linkedbug", "bugid", "bugreference", "issue", "defect"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function normalizeResult(raw: string): TestResult | null {
  const v = norm(raw);
  if (v === "") return "Not Run";
  if (["pass", "passed", "ok", "success"].includes(v)) return "Pass";
  if (["fail", "failed", "failure", "ng"].includes(v)) return "Fail";
  if (["blocked", "block"].includes(v)) return "Blocked";
  if (["notrun", "norun", "notexecuted", "pending", "todo", "notstarted"].includes(v)) return "Not Run";
  return null;
}

export const MAX_IMPORT_ROWS = 2000;

export function mapTestCaseRows(rows: string[][]): { cases: ParsedCase[]; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (rows.length === 0) return { cases: [], errors: ["The file is empty."], warnings };

  const header = rows[0].map(norm);
  const col = {} as Record<keyof typeof ALIASES, number>;
  for (const key of Object.keys(ALIASES) as (keyof typeof ALIASES)[]) {
    col[key] = header.findIndex((h) => ALIASES[key].includes(h));
  }
  if (col.title < 0) {
    return { cases: [], errors: ["The first row must contain a Title column (also accepted: Test Case, Name, Scenario)."], warnings };
  }
  const body = rows.slice(1);
  if (body.length > MAX_IMPORT_ROWS) {
    return { cases: [], errors: [`Too many rows (${body.length}). Import at most ${MAX_IMPORT_ROWS} at a time.`], warnings };
  }

  const cases: ParsedCase[] = [];
  const seen = new Set<string>();
  body.forEach((r, i) => {
    const n = i + 2; // spreadsheet row number
    const get = (k: keyof typeof ALIASES, max = 5000) => (col[k] >= 0 ? (r[col[k]] ?? "").trim().slice(0, max) : "");
    const title = get("title", 300);
    if (!title) {
      errors.push(`Row ${n}: missing title, skipped.`);
      return;
    }
    let result = normalizeResult(get("result"));
    if (result === null) {
      warnings.push(`Row ${n}: unknown result "${get("result")}", imported as Not Run.`);
      result = "Not Run";
    }
    if (seen.has(title.toLowerCase())) warnings.push(`Row ${n}: "${title}" appears more than once in the file.`);
    seen.add(title.toLowerCase());
    cases.push({
      title,
      prerequisites: get("prerequisites"),
      steps: get("steps"),
      expectedResult: get("expectedResult"),
      actualResult: get("actualResult"),
      result,
      remarks: get("remarks"),
      linkedBug: get("linkedBug", 200),
    });
  });
  return { cases, errors, warnings };
}

export function templateCsv(): string {
  return [
    "Title,Prerequisites,Steps,Expected Result,Actual Result,Result,Remarks,Bug",
    '"Book a one-way ticket","User is logged in","1. Open booking\n2. Choose route\n3. Pay","Ticket is issued","",Not Run,"",""',
    '"Cancel a booking","A paid booking exists","1. Open booking\n2. Press cancel","Refund is queued","",Not Run,"",""',
  ].join("\n");
}

// ---------- CSV writing (exports) ----------

/**
 * Serialises rows to CSV. Cells that start with = + - @ (or a tab / carriage return) are prefixed with an
 * apostrophe so spreadsheet apps cannot run them as formulas (CSV injection).
 */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    let s: string;
    if (v instanceof Date) s = v.toISOString();
    else if (typeof v === "object") s = JSON.stringify(v);
    else s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(cell).join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(","));
  return lines.join("\r\n");
}
