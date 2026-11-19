/**
 * Typo-tolerant matching helpers (pure, offline). Used by Brain Dump to match projects, tasks, people and tags.
 * Strings are compared after normalising case, accents and punctuation. Short words must match exactly, so
 * "api" never turns into "apt"; longer words may differ by one character (two for long ones), and common
 * Indonesian spelling variants (andy/andi, boedi/budi, djaja/jaya) count as the same name.
 */
export const STOPWORDS = new Set([
  "a", "an", "the", "to", "of", "for", "with", "on", "in", "at", "about", "and", "or", "by", "from", "re", "regarding", "please", "pls",
  "dan", "yang", "untuk", "ke", "di", "dari", "dengan", "soal", "tentang", "atau", "pada", "itu", "ini", "tolong", "sama", "si",
]);

export const normalize = (s: string): string =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function tokens(s: string, dropStopwords = true): string[] {
  return normalize(s).split(" ").filter((t) => t && (!dropStopwords || !STOPWORDS.has(t)));
}

/** Optimal string alignment distance: insertions, deletions, substitutions and adjacent swaps each cost 1. */
export function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** 0..1, where 1 means identical. */
export function similarity(a: string, b: string): number {
  const m = Math.max(a.length, b.length);
  return m === 0 ? 1 : 1 - distance(a, b) / m;
}

/** Sound-alike key for names, covering common Indonesian and Dutch-era spellings. */
export function phoneticKey(s: string): string {
  return normalize(s)
    .replace(/\s+/g, "")
    .replace(/oe/g, "u").replace(/dj/g, "j").replace(/tj/g, "c").replace(/ph/g, "f").replace(/ch/g, "h").replace(/y/g, "i")
    .replace(/(.)\1+/g, "$1");
}

/** How many characters may differ for two words of these lengths to still count as the same word. */
export function allowedDistance(a: string, b: string): number {
  const shortest = Math.min(a.length, b.length);
  if (shortest < 4) return 0;
  return shortest >= 7 && Math.max(a.length, b.length) >= 8 ? 2 : 1;
}

export function closeEnough(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 3) return false;
  if (Math.min(a.length, b.length) >= 3 && phoneticKey(a) === phoneticKey(b)) return true;
  return distance(a, b) <= allowedDistance(a, b);
}

/** Greedy one-to-one matching of words that are close enough. */
function matchedTokens(a: string[], b: string[]): number {
  const used = new Set<number>();
  let m = 0;
  for (const x of a) {
    const j = b.findIndex((y, i) => !used.has(i) && closeEnough(x, y));
    if (j >= 0) {
      used.add(j);
      m++;
    }
  }
  return m;
}

export interface TitleScore { dice: number; containment: number; matched: number; a: number; b: number }

/** Word-overlap similarity of two titles, tolerant to typos and filler words (the, with, untuk, ...). */
export function titleSimilarity(aTitle: string, bTitle: string): TitleScore {
  const a = tokens(aTitle);
  const b = tokens(bTitle);
  if (!a.length || !b.length) return { dice: 0, containment: 0, matched: 0, a: a.length, b: b.length };
  const m = matchedTokens(a, b);
  return { dice: (2 * m) / (a.length + b.length), containment: m / Math.min(a.length, b.length), matched: m, a: a.length, b: b.length };
}

/** Maps a typed name to an existing one when it is clearly the same (typo, sound-alike, or just a first name). */
export function snapName(name: string, known: readonly string[]): string {
  const n = normalize(name);
  if (!n) return name;
  const exact = known.find((k) => normalize(k) === n);
  if (exact) return exact;
  const single = !n.includes(" ");
  if (single && n.length >= 3) {
    const firstNames = known.filter((k) => normalize(k).split(" ")[0] === n);
    if (firstNames.length === 1) return firstNames[0];
  }
  const compact = n.replace(/ /g, "");
  const close = known.filter((k) => {
    const kn = normalize(k);
    return closeEnough(compact, kn.replace(/ /g, "")) || (single && kn.split(" ").some((t) => t.length >= 4 && closeEnough(n, t)));
  });
  return close.length === 1 ? close[0] : name;
}

// ---------------------------------------------------------------- typo repair for the words the parser understands

export const TYPO_VOCAB: readonly string[] = [
  "tomorrow", "yesterday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "august", "september", "october", "november", "december",
  "besok", "lusa", "senin", "selasa", "kamis", "jumat", "sabtu", "minggu", "depan", "januari", "februari", "maret", "agustus", "oktober", "desember",
  "follow", "followup", "retest", "meeting", "document", "release", "escalate", "urgent", "critical", "investigate", "deploy", "rapat", "segera", "eskalasi",
];
const SUFFIXES = ["s", "es", "d", "ed", "ing", "er"];

/**
 * Repairs obvious typos of date and keyword words ("tommorow", "follw up", "fridy"). Only words of 5+ letters that are
 * one edit away (two for long words) from a known word are touched, plurals and other suffix forms are left alone,
 * and every repair is reported so the user can see it.
 */
export function fixTypos(text: string, vocab: readonly string[] = TYPO_VOCAB): { text: string; fixes: [string, string][] } {
  const known = new Set(vocab);
  const fixes: [string, string][] = [];
  const out = text.replace(/\p{L}{5,}/gu, (word) => {
    const w = word.toLowerCase();
    if (known.has(w)) return word;
    let best: { v: string; d: number } | null = null;
    for (const v of vocab) {
      if (v.length < 5 || Math.abs(v.length - w.length) > 2) continue;
      if (SUFFIXES.some((s) => w === v + s || v === w + s)) continue; // "documents" is not a typo of "document"
      const d = distance(w, v);
      const limit = v.length >= 8 && w.length >= 8 ? 2 : 1;
      if (d <= limit && (!best || d < best.d)) best = { v, d };
    }
    if (!best) return word;
    const fixed = word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase() ? best.v[0].toUpperCase() + best.v.slice(1) : best.v;
    fixes.push([word, fixed]);
    return fixed;
  });
  return { text: out, fixes };
}
