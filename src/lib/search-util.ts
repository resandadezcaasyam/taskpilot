/** Returns the text around the first match of q, split for highlighting. Whitespace is collapsed. */
export function makeSnippet(text: string | null | undefined, q: string, radius = 70): { before: string; match: string; after: string } | null {
  if (!text || !q.trim()) return null;
  const t = text.replace(/\s+/g, " ").trim();
  const i = t.toLowerCase().indexOf(q.trim().toLowerCase());
  if (i < 0) return null;
  const len = q.trim().length;
  const start = Math.max(0, i - radius);
  const end = Math.min(t.length, i + len + radius);
  return { before: (start > 0 ? "…" : "") + t.slice(start, i), match: t.slice(i, i + len), after: t.slice(i + len, end) + (end < t.length ? "…" : "") };
}
