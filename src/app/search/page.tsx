import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { Card, EmptyState } from "@/components/ui/card";
import { globalSearch, SEARCH_GROUPS, type SearchItem } from "@/lib/search";

export const metadata: Metadata = { title: "Search" };

function Highlighted({ s }: { s: NonNullable<SearchItem["snippet"]> }) {
  return (
    <p className="mt-1 text-[13px] text-muted-foreground">
      {s.before}<mark className="rounded bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-500/30">{s.match}</mark>{s.after}
    </p>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const results = query.length >= 2 ? await globalSearch(query) : null;
  const total = results ? SEARCH_GROUPS.reduce((n, g) => n + results[g.key].items.length, 0) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tasks, projects, UAT, issues, notes, stakeholders and tags. Press <kbd className="rounded border border-border bg-muted px-1.5 text-xs">/</kbd> anywhere to search.</p>
      </div>
      <form action="/search" className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input name="q" defaultValue={query} autoFocus placeholder="Search everything…" aria-label="Search everything" className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm" />
      </form>

      {!results ? (
        <Card><EmptyState icon={<Search />} title={query ? "Type at least 2 characters" : "Search your whole workspace"} description="Try a task title, a person's name, a tag, a test case step, or something you wrote in a note." /></Card>
      ) : total === 0 ? (
        <Card><EmptyState icon={<Search />} title={`Nothing found for “${query}”`} description="Check the spelling, or try a shorter word." /></Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{total}{SEARCH_GROUPS.some((g) => results[g.key].more) ? "+" : ""} results for &ldquo;{query}&rdquo;</p>
          <div className="space-y-4">
            {SEARCH_GROUPS.filter((g) => results[g.key].items.length > 0).map((g) => (
              <Card key={g.key}>
                <div className="flex items-baseline justify-between px-5 pb-1 pt-4">
                  <h2 className="text-[15px] font-semibold tracking-tight">{g.label}</h2>
                  <span className="text-xs text-muted-foreground">{results[g.key].items.length}{results[g.key].more ? "+" : ""}</span>
                </div>
                <ul>
                  {results[g.key].items.map((it) => (
                    <li key={it.id} className="border-t border-border px-5 py-3 first:border-t-0">
                      <Link href={it.href} className="font-medium hover:text-primary">{it.title}</Link>
                      {it.subtitle && <p className="text-xs text-muted-foreground">{it.subtitle}</p>}
                      {it.snippet && <Highlighted s={it.snippet} />}
                    </li>
                  ))}
                </ul>
                {results[g.key].more && <p className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">Showing the first 15. Refine your search to narrow it down.</p>}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
