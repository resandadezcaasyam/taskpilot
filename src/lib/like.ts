/**
 * SQLite LIKE treats % and _ as wildcards, and Prisma's `contains` does not escape them, so searching for
 * "100%" would match everything. For such queries we widen the database window and keep only the rows that
 * contain the text literally (case-insensitive).
 */
export const hasWildcard = (q: string) => /[%_\\]/.test(q);

export function literalOnly<T>(rows: T[], q: string): T[] {
  if (!hasWildcard(q)) return rows;
  const needle = q.trim().toLowerCase();
  return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(needle));
}

/** How many rows to fetch from the database for a search (more when wildcard characters need post-filtering). */
export const fetchWindow = (q: string, normal: number) => (hasWildcard(q) ? 1000 : normal);
