/**
 * Brain Dump parser (pure, offline). Turns pasted lines into complete task forms.
 *
 * One line = one task. Everything except the title is optional:
 *   status    [x] done  | done: ...  | [~] doing: ... | [!] blocked: ...      (default: the page's default status)
 *   priority  !  or !h = High   !! or !c = Critical   !m = Medium   !l = Low
 *   project   @booking  or  @"UAT Booking"      (matched by name, unique partial matches are fine)
 *   estimate  ~30m  ~1h  ~1.5h  ~2jam
 *   waiting   >Andi  or  >"Backend team"        (sets status to Waiting for Others)
 *   progress  %75
 *   next step => what to do next                (for a blocked line, the text after => is the blocker)
 *   tags      #uat #vendor
 *   dates     tomorrow, next Friday, 25 Nov, besok, ...  (understood in plain words, see quick-parse.ts)
 * Leading bullets and numbers ("- ", "1. ", "• ") are ignored, as are blank lines, "# headings" and "---".
 */
import { closeEnough, fixTypos, normalize, similarity, snapName, tokens } from "./fuzzy";
import { parseQuickCapture } from "./quick-parse";
import { EMPTY_TASK_FORM } from "./task-form";
import type { TaskFormValues } from "./validators";

export const MAX_BRAIN_DUMP_LINES = 100;

export interface BrainDumpContext {
  projects: { id: string; name: string }[];
  /** Known names, so a typed "andy" or "#uatt" snaps to the existing "Andi" / "uat". */
  people?: readonly string[];
  tags?: readonly string[];
  /** An @project that matches nothing becomes a proposed new project ("new:Name") instead of a warning. */
  createMissingProjects?: boolean;
  defaults: {
    status: TaskFormValues["status"];
    priority: TaskFormValues["priority"];
    category: TaskFormValues["category"];
    projectId: string;
  };
}

export interface ParsedLine {
  /** The original line as typed. */
  raw: string;
  /** Unique per line (the same text twice gets different keys). */
  key: string;
  values: TaskFormValues;
  warnings: string[];
  /** Human-readable list of what was picked up, e.g. "Project: UAT Booking". */
  detected: string[];
  /** The fields this line actually stated (as opposed to page defaults). Used when it updates an existing task. */
  explicit: (keyof TaskFormValues)[];
  /** A project the line almost matches, offered as a one-click fix. */
  didYouMean?: { id: string; name: string };
  /** Set when the line names a project that does not exist yet ("new:" id in values.projectId). */
  newProjectName?: string;
}

export const CHEAT_SHEET: { token: string; meaning: string; example: string }[] = [
  { token: "!h  !c  !m  !l", meaning: "Priority (! = High, !! = Critical)", example: "Fix login bug !c" },
  { token: "@project", meaning: "Project, by part of its name", example: "Retest booking @uat" },
  { token: "~30m  ~1.5h", meaning: "Time estimate", example: "Write release notes ~45m" },
  { token: ">Name", meaning: "Waiting for someone", example: "API timestamp >Andi" },
  { token: "%75", meaning: "Progress in percent", example: "Draft test plan %75" },
  { token: "=> text", meaning: "Next step (the blocker, for blocked lines)", example: "Prepare slides => collect numbers" },
  { token: "#tag", meaning: "Tag", example: "Vendor call #vendor" },
  { token: "tomorrow, next Fri, 25 Nov, besok", meaning: "Date (due, or follow-up for \"follow up…\" lines)", example: "Follow up Budi tomorrow" },
  { token: "[x]  done:", meaning: "Already finished today", example: "[x] Sent weekly report" },
  { token: "[~]  doing:", meaning: "In progress", example: "doing: Review PRD" },
  { token: "[!]  blocked:", meaning: "Blocked (add the reason after =>)", example: "blocked: Vendor compliance => timestamp missing" },
];

const STATUS_WORDS: [RegExp, TaskFormValues["status"]][] = [
  [/^(done|selesai|finished|completed|sudah)\s*[:\-–]\s*/i, "Done"],
  [/^(doing|wip|in progress|sedang|progress)\s*[:\-–]\s*/i, "In Progress"],
  [/^(blocked|blocker|stuck|terhambat)\s*[:\-–]\s*/i, "Blocked"],
  [/^(todo|to do|next)\s*[:\-–]\s*/i, "To Do"],
];

/** Removes the first match (keeping the leading whitespace group) and returns it. */
function take(text: string, re: RegExp): { text: string; m: RegExpExecArray | null } {
  const m = re.exec(text);
  if (!m) return { text, m: null };
  return { text: text.slice(0, m.index) + (m[1] ?? "") + text.slice(m.index + m[0].length), m };
}

// words that describe an activity (or are too common) say nothing about WHICH project a line belongs to
const GENERIC_PROJECT_WORDS = new Set(["project", "proyek", "phase", "fase", "app", "system", "sistem", "new", "baru", "team", "tim", "misc", "other", "general", "umum", "uat", "qa", "dev", "test", "testing", "release", "bug", "fix"]);

export interface ProjectMatch {
  id?: string;
  name?: string;
  fuzzy?: boolean;
  ambiguous?: string[];
  suggestion?: { id: string; name: string };
}

/**
 * Matches what was typed after "@" to a project: exact, then start-of-name, then contained text, and finally
 * typo-tolerant ("bokking" finds "Booking"). Close calls are never guessed: they return `ambiguous` or a `suggestion`.
 */
export function matchProject(query: string, projects: { id: string; name: string }[]): ProjectMatch {
  const q = normalize(query);
  if (!q) return {};
  for (const test of [(n: string) => n === q, (n: string) => n.startsWith(q), (n: string) => n.includes(q)]) {
    const hits = projects.filter((p) => test(normalize(p.name)));
    if (hits.length === 1) return { id: hits[0].id, name: hits[0].name };
    if (hits.length > 1) return { ambiguous: hits.map((h) => h.name) };
  }
  const scored = projects
    .map((p) => {
      const name = normalize(p.name);
      return { p, s: Math.max(similarity(q, name), ...name.split(" ").map((t) => similarity(q, t))) };
    })
    .sort((x, y) => y.s - x.s);
  const [first, second] = scored;
  if (first && first.s >= 0.78) {
    if (second && first.s - second.s < 0.08 && second.s >= 0.78) return { ambiguous: [first.p.name, second.p.name] };
    return { id: first.p.id, name: first.p.name, fuzzy: true };
  }
  if (first && first.s >= 0.6) return { suggestion: { id: first.p.id, name: first.p.name } };
  return {};
}

/** A project mentioned by one of its distinctive words anywhere in the line (typos allowed), when exactly one project fits. */
export function guessProject(text: string, projects: { id: string; name: string }[]): { id: string; name: string } | null {
  const words = tokens(text);
  if (!words.length || !projects.length) return null;
  const withTokens = projects.map((p) => ({ p, toks: [...new Set(tokens(p.name).filter((t) => t.length >= 3 && !GENERIC_PROJECT_WORDS.has(t)))] }));
  const df = new Map<string, number>();
  for (const { toks } of withTokens) for (const t of toks) df.set(t, (df.get(t) ?? 0) + 1);
  // a project is only "mentioned" if at least half of its distinctive words appear (one word is enough for short names,
  // but "vendor" alone must not pull a line into "Inter-island Vendor Compliance")
  const hits = withTokens.filter(({ toks }) => {
    const distinctive = toks.filter((t) => df.get(t) === 1);
    const matched = distinctive.filter((t) => words.some((w) => (t.length >= 4 ? closeEnough(w, t) : w === t))).length;
    return matched >= Math.max(1, Math.ceil(distinctive.length / 2));
  });
  return hits.length === 1 ? hits[0].p : null;
}

const tidyProjectName = (raw: string) => {
  const spaced = raw.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return spaced === spaced.toLowerCase() ? spaced.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : spaced;
};

const PRIORITY_WORDS: Record<string, TaskFormValues["priority"]> = {
  critical: "Critical", crit: "Critical", c: "Critical", high: "High", h: "High", medium: "Medium", med: "Medium", m: "Medium", low: "Low", l: "Low",
};

function parseLine(raw: string, ctx: BrainDumpContext, now: Date): Omit<ParsedLine, "key"> | null {
  let rest = raw.trim();
  if (!rest || /^(\/\/|#{1,6}\s)/.test(rest) || /^[-=_*~]{3,}$/.test(rest)) return null;

  // list bullets, numbering and checkboxes
  let marker: TaskFormValues["status"] | undefined;
  for (let i = 0; i < 3; i++) {
    const bullet = rest.match(/^(?:[-*•–—]+|\d{1,3}[.)])\s+/u);
    if (bullet) {
      rest = rest.slice(bullet[0].length);
      continue;
    }
    const box = rest.match(/^(\[[ xX~!]\]|[☐☑✓✔✅])\s*/u);
    if (box) {
      const t = box[1];
      if (/[xX☑✓✔✅]/u.test(t)) marker = "Done";
      else if (t === "[~]") marker = "In Progress";
      else if (t === "[!]") marker = "Blocked";
      rest = rest.slice(box[0].length);
      continue;
    }
    break;
  }
  for (const [re, status] of STATUS_WORDS) {
    const m = rest.match(re);
    if (m) {
      marker = marker ?? status;
      rest = rest.slice(m[0].length);
      break;
    }
  }

  const warnings: string[] = [];
  const detected: string[] = [];

  // "=> text" must come last on the line; it is cut off before the other shortcuts are read
  let arrowText = "";
  const arrow = /\s*(?:=>|→)\s*(.*)$/u.exec(rest);
  if (arrow) {
    arrowText = arrow[1].trim();
    rest = rest.slice(0, arrow.index);
  }

  let projectId = "";
  let didYouMean: ParsedLine["didYouMean"];
  let newProjectName: string | undefined;
  const explicit = new Set<keyof TaskFormValues>();
  const proj = take(rest, /(^|\s)@(?:"([^"]+)"|([\p{L}\p{N}][\p{L}\p{N}_.-]*))/u);
  rest = proj.text;
  if (proj.m) {
    const name = (proj.m[2] ?? proj.m[3] ?? "").replace(/[.,;:]+$/, "");
    const hit = matchProject(name, ctx.projects);
    if (hit.id) {
      projectId = hit.id;
      explicit.add("projectId");
      detected.push(hit.fuzzy ? `Project: ${hit.name} (matched from @${name})` : `Project: ${hit.name}`);
    } else if (hit.ambiguous) warnings.push(`@${name} matches several projects (${hit.ambiguous.join(", ")}). Pick one below.`);
    else if (hit.suggestion) {
      didYouMean = hit.suggestion;
      warnings.push(`No project called @${name}. Did you mean "${hit.suggestion.name}"?`);
    } else if (ctx.createMissingProjects && name.length >= 3) {
      newProjectName = tidyProjectName(name);
      projectId = `new:${newProjectName}`;
      explicit.add("projectId");
      detected.push(`New project: ${newProjectName} (will be created)`);
    } else warnings.push(`No project matches @${name}. Pick one below or leave it empty.`);
  }

  let waitingFor = "";
  const wait = take(rest, /(^|\s)>(?:"([^"]+)"|([\p{L}\p{N}][\p{L}\p{N}_.-]*))/u);
  rest = wait.text;
  if (wait.m) {
    const typed = (wait.m[2] ?? wait.m[3] ?? "").replace(/[.,;:]+$/, "");
    waitingFor = ctx.people ? snapName(typed, ctx.people) : typed;
    detected.push(waitingFor !== typed ? `Waiting for: ${waitingFor} (matched from ${typed})` : `Waiting for: ${waitingFor}`);
  }

  let estimatedHours = "";
  const est = take(rest, /(^|\s)~(\d+(?:[.,]\d+)?)\s?(minutes|minute|mins|min|menit|m|hours|hour|hrs|hr|h|jam|j)?(?=\s|$|[.,;:])/iu);
  rest = est.text;
  if (est.m) {
    const n = Number(est.m[2].replace(",", "."));
    const hours = /^(h|j)/i.test(est.m[3] ?? "") ? n : n / 60;
    if (hours > 24) warnings.push("The estimate is more than 24 hours. Check it.");
    estimatedHours = String(Math.round(hours * 100) / 100);
    explicit.add("estimatedHours");
    detected.push(`Estimate: ${est.m[2]}${/^(h|j)/i.test(est.m[3] ?? "") ? "h" : "m"}`);
  }

  let progress: string | undefined;
  const prog = take(rest, /(^|\s)%(\d{1,3})(?=\s|$|[.,;:])/u);
  rest = prog.text;
  if (prog.m) {
    const p = Number(prog.m[2]);
    if (p > 100) warnings.push("Progress cannot be more than 100%. It was set to 100.");
    progress = String(Math.min(100, p));
    explicit.add("progress");
    detected.push(`Progress: ${progress}%`);
  }

  let priority: TaskFormValues["priority"] | undefined;
  const pri = take(rest, /(^|\s)!(critical|crit|c|high|h|medium|med|m|low|l|!{1,2})?(?=\s|$|[.,;:])/iu);
  rest = pri.text;
  if (pri.m) {
    const w = pri.m[2];
    priority = !w ? "High" : w.startsWith("!") ? "Critical" : PRIORITY_WORDS[w.toLowerCase()];
    explicit.add("priority");
    detected.push(`Priority: ${priority}`);
  }

  // repair typos in date / keyword words, then read dates, category, priority words, tags and the cleaned title
  const fixed = fixTypos(rest);
  for (const [from, to] of fixed.fixes) detected.push(`Typo fixed: ${from} → ${to}`);
  rest = fixed.text;
  const q = parseQuickCapture(rest, now);
  const status: TaskFormValues["status"] = marker ?? (waitingFor ? "Waiting for Others" : ctx.defaults.status);
  const done = status === "Done";
  if (marker || waitingFor) explicit.add("status");
  if (waitingFor) explicit.add("waitingFor");
  if (q.priority && !priority) explicit.add("priority");
  if (!done && q.dueDate) explicit.add("dueDate");
  if (!done && q.followUpDate) explicit.add("followUpDate");

  // a project mentioned in plain words ("retest bokking cases") when no @project was given
  if (!projectId && !proj.m) {
    const guess = guessProject(q.title, ctx.projects);
    if (guess) {
      projectId = guess.id;
      // a guess is only used for NEW tasks; it never changes the project of an existing task, so it is not "explicit"
      detected.push(`Project (guessed from the text): ${guess.name}`);
    }
  }
  const tagList = q.tags.map((t) => {
    const hit = ctx.tags ? snapName(t, ctx.tags) : t;
    if (hit !== t) detected.push(`Tag: ${hit} (matched from #${t})`);
    return hit;
  });
  if (tagList.length) explicit.add("tags");

  const title = q.title.slice(0, 200);
  if (!title) warnings.push("No title found on this line.");
  if (q.title.length > 200) warnings.push("The title was shortened to 200 characters.");

  let blockerDescription = "";
  let nextAction = q.nextAction ?? "";
  if (status === "Blocked") {
    blockerDescription = arrowText;
    if (blockerDescription) explicit.add("blockerDescription");
    if (!blockerDescription) warnings.push("Blocked tasks need a reason. Add it after => or type it below.");
  } else if (arrowText) {
    nextAction = arrowText;
    explicit.add("nextAction");
  }
  if (status === "Waiting for Others" && !waitingFor) warnings.push("Say who you are waiting for.");

  for (const d of q.detected) if ((!d.startsWith("Priority") || !priority) && !d.startsWith("Tags:")) detected.push(d);
  if (tagList.length) detected.push(`Tags: ${tagList.map((t) => `#${t}`).join(" ")}`);
  if (marker) detected.unshift(`Status: ${status}`);

  const values: TaskFormValues = {
    ...EMPTY_TASK_FORM,
    title,
    projectId: projectId || ctx.defaults.projectId,
    category: (q.category as TaskFormValues["category"] | undefined) ?? ctx.defaults.category,
    priority: priority ?? (q.priority as TaskFormValues["priority"] | undefined) ?? ctx.defaults.priority,
    status,
    // finished work does not need deadlines
    dueDate: done ? "" : (q.dueDate ?? ""),
    followUpDate: done ? "" : (q.followUpDate ?? ""),
    estimatedHours,
    progress: done ? "100" : (progress ?? "0"),
    nextAction: done ? "" : nextAction,
    blockerDescription,
    waitingFor,
    tags: tagList.join(", "),
  };
  return { raw, values, warnings, detected, explicit: [...explicit], didYouMean, newProjectName };
}

/** Parses a whole pasted block. Blank lines, headings and separators are skipped. */
export function parseBrainDump(text: string, ctx: BrainDumpContext, now: Date = new Date()): { items: ParsedLine[]; truncated: number } {
  const seen = new Map<string, number>();
  const items: ParsedLine[] = [];
  let truncated = 0;
  for (const line of text.split(/\r?\n/)) {
    const p = parseLine(line, ctx, now);
    if (!p) continue;
    if (items.length >= MAX_BRAIN_DUMP_LINES) {
      truncated++;
      continue;
    }
    const n = (seen.get(p.raw) ?? 0) + 1;
    seen.set(p.raw, n);
    items.push({ ...p, key: `${p.raw}#${n}` });
  }
  return { items, truncated };
}
