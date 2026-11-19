/**
 * Rule-based Quick Capture parser (no AI, works offline). Turns a sentence such as
 * "Follow up with engineering about the API issue tomorrow" into a structured task.
 * Understands English and basic Indonesian dates and keywords.
 */
import { addDaysKey } from "./calendar";
import { dateKey } from "./dates";

export interface QuickParse {
  title: string;
  category?: string;
  priority?: string;
  dueDate?: string;
  followUpDate?: string;
  nextAction?: string;
  tags: string[];
  detected: string[];
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, minggu: 0, monday: 1, mon: 1, senin: 1, tuesday: 2, tue: 2, tues: 2, selasa: 2, wednesday: 3, wed: 3, rabu: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, kamis: 4, friday: 5, fri: 5, jumat: 5, jum: 5, saturday: 6, sat: 6, sabtu: 6,
};
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, januari: 1, feb: 2, february: 2, februari: 2, mar: 3, march: 3, maret: 3, apr: 4, april: 4, may: 5, mei: 5,
  jun: 6, june: 6, juni: 6, jul: 7, july: 7, juli: 7, aug: 8, august: 8, agu: 8, agt: 8, agustus: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, okt: 10, oktober: 10, nov: 11, november: 11, nop: 11, dec: 12, december: 12, des: 12, desember: 12,
};
const dowOf = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();
const pad = (n: number) => String(n).padStart(2, "0");
const validYmd = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

interface Found { key: string; text: string; start: number; end: number }

function findDate(input: string, today: string): Found | null {
  const lower = input.toLowerCase();
  const m = (re: RegExp) => re.exec(lower);
  const at = (match: RegExpExecArray | null, key: string): Found | null =>
    match ? { key, text: match[0], start: match.index, end: match.index + match[0].length } : null;

  let r: RegExpExecArray | null;
  if ((r = m(/\b(\d{4})-(\d{2})-(\d{2})\b/)) && validYmd(+r[1], +r[2], +r[3])) return at(r, r[0]);
  if ((r = m(/\b(day after tomorrow|lusa)\b/))) return at(r, addDaysKey(today, 2));
  if ((r = m(/\b(tomorrow|tmrw|besok)\b/))) return at(r, addDaysKey(today, 1));
  if ((r = m(/\b(today|hari ini|hr ini)\b/))) return at(r, today);
  if ((r = m(/\b(?:in|dalam)\s+(\d{1,3})\s+(day|days|hari)\b/))) return at(r, addDaysKey(today, +r[1]));
  if ((r = m(/\b(?:in|dalam)\s+(\d{1,2})\s+(week|weeks|minggu)\b/))) return at(r, addDaysKey(today, 7 * +r[1]));
  if ((r = m(/\b(next week|minggu depan|pekan depan)\b/))) return at(r, addDaysKey(today, 8 - (dowOf(today) || 7)));
  if ((r = m(/\b(end of (?:the )?week|eow|akhir minggu|akhir pekan)\b/))) {
    const d = dowOf(today);
    return at(r, addDaysKey(today, d >= 5 || d === 0 ? (d === 0 ? 5 : 0) : 5 - d));
  }
  // weekday names, optionally preceded by next / this / hari
  const wd = new RegExp(`\\b(?:(next|this|depan|hari)\\s+)?(${Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join("|")})\\b(?:\\s+(depan))?`);
  if ((r = m(wd))) {
    const target = WEEKDAYS[r[2]];
    let diff = (target - dowOf(today) + 7) % 7 || 7;
    if (r[1] === "next" || r[3] === "depan") {
      const toNextMonday = 8 - (dowOf(today) || 7);
      if (diff < toNextMonday) diff += 7;
    }
    return at(r, addDaysKey(today, diff));
  }
  // 25 Nov, 25 november 2026, nov 25
  const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
  const resolveYear = (mo: number, d: number, y?: string) => {
    const year = y ? +y : +today.slice(0, 4);
    let key = `${year}-${pad(mo)}-${pad(d)}`;
    if (!y && key < today) key = `${year + 1}-${pad(mo)}-${pad(d)}`;
    return validYmd(+key.slice(0, 4), mo, d) ? key : null;
  };
  if ((r = m(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\b(?:\\s+(\\d{4}))?`)))) {
    const key = resolveYear(MONTHS[r[2]], +r[1], r[3]);
    if (key) return at(r, key);
  }
  if ((r = m(new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`)))) {
    const key = resolveYear(MONTHS[r[1]], +r[2], r[3]);
    if (key) return at(r, key);
  }
  if ((r = m(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    const y = r[3] ? (r[3].length === 2 ? `20${r[3]}` : r[3]) : undefined;
    const key = resolveYear(+r[2], +r[1], y); // day/month, as written in Indonesia
    if (key) return at(r, key);
  }
  return null;
}

const FOLLOW = /\b(follow[ -]?up|chase|nudge|ping|remind(?:er)?|check with|check in with|ask|tindak ?lanjut|tanyakan|tanya|ingatkan|kejar)\b/i;
const CATEGORY_RULES: [RegExp, string][] = [
  [/\b(escalat\w*|eskalasi)\b/i, "Issue Escalation"],
  [/\b(uat|test cases?|retest\w*|regression|qa)\b/i, "UAT / QA"],
  [/\b(bug|error|investigat\w*|root cause|debug|crash|exception)\b/i, "Bug Investigation"],
  [/\b(meeting|meet|sync|catch[ -]?up|call|rapat|standup)\b/i, "Meeting"],
  [/\b(documentation|document|docs?|prd|spec|write[ -]?up|brd)\b/i, "Documentation"],
  [/\b(release|deploy\w*|rollout|monitor\w*|go[ -]?live)\b/i, "Release Monitoring"],
  [/\b(planning|plan|roadmap|prioriti[sz]e)\b/i, "Project Planning"],
  [/\b(incident|support|operational|ops|outage)\b/i, "Operational Support"],
  [/\b(enhance\w*|improve\w*|feature request)\b/i, "Product Enhancement"],
  [/\b(develop\w*|implement\w*|build|feature)\b/i, "Feature Development"],
];

export function parseQuickCapture(input: string, now: Date = new Date()): QuickParse {
  const today = dateKey(now);
  let text = input.trim().replace(/\s+/g, " ");
  const detected: string[] = [];
  if (!text) return { title: "", tags: [], detected };

  const tags = [...text.matchAll(/(^|\s)#([\p{L}\p{N}_-]{1,30})/gu)].map((m) => m[2].toLowerCase());
  text = text.replace(/(^|\s)#[\p{L}\p{N}_-]{1,30}/gu, " ");

  let priority: string | undefined;
  if (/\b(critical|p0|darurat|blocker)\b/i.test(text)) priority = "Critical";
  else if (/\b(urgent|asap|segera|penting|high priority)\b/i.test(text)) priority = "High";
  else if (/\b(low priority|someday|nice to have|santai|when possible)\b/i.test(text)) priority = "Low";
  if (priority) text = text.replace(/\b(critical|p0|darurat|urgent|asap|segera|penting|(?:high|low) priority|someday|nice to have|santai|when possible)\b[:,]?/gi, " ");

  const found = findDate(text, today);
  if (found) {
    const before = text.slice(0, found.start).replace(/\b(on|by|before|until|due|pada|sebelum|hingga|sampai|untuk|pada hari|di)\s*$/i, "");
    text = `${before} ${text.slice(found.end)}`;
  }

  const title = text.replace(/\s+/g, " ").replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "");
  const isFollow = FOLLOW.test(title);
  const category = isFollow ? "Stakeholder Follow-up" : CATEGORY_RULES.find(([re]) => re.test(title))?.[1];

  const out: QuickParse = { title: title.charAt(0).toUpperCase() + title.slice(1), tags, detected };
  if (category) {
    out.category = category;
    detected.push(`Category: ${category}`);
  }
  if (priority) {
    out.priority = priority;
    detected.push(`Priority: ${priority}`);
  }
  if (found) {
    if (isFollow) {
      out.followUpDate = found.key;
      detected.push(`Follow-up date: ${found.key}`);
    } else {
      out.dueDate = found.key;
      detected.push(`Due date: ${found.key}`);
    }
  }
  if (isFollow) out.nextAction = out.title;
  if (tags.length) detected.push(`Tags: ${tags.map((t) => `#${t}`).join(" ")}`);
  return out;
}
