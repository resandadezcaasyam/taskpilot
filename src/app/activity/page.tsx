import type { Metadata } from "next";
import Link from "next/link";
import { ActivityList } from "@/components/activity-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form-controls";
import { ACTIVITY_GROUPS, queryActivities } from "@/lib/activity-query";
import { dateKey, formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Activity History" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const take = Math.min(Number(sp.take) || 100, 1000);
  const { items, hasMore } = await queryActivities({ group: sp.group, q: sp.q, from: sp.from, to: sp.to, take });
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v) p.set(k, v);
    return `/activity${p.size ? `?${p}` : ""}`;
  };
  const days = new Map<string, typeof items>();
  for (const a of items) {
    const k = dateKey(a.createdAt);
    days.set(k, [...(days.get(k) ?? []), a]);
  }
  const filtered = Boolean(sp.group || sp.q || sp.from || sp.to);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity history</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every change is recorded and kept across restarts. Filter by area, text or dates.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by area">
        {[{ key: "", label: "All" }, ...ACTIVITY_GROUPS].map((g) => (
          <Link key={g.key} href={href({ group: g.key || undefined, take: undefined })} className={cn("rounded-full border px-3 py-1 text-xs font-medium", (sp.group ?? "") === g.key ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:text-foreground")}>{g.label}</Link>
        ))}
      </div>
      <form action="/activity" className="flex flex-wrap items-center gap-2">
        {sp.group && <input type="hidden" name="group" value={sp.group} />}
        <Input name="q" defaultValue={sp.q} placeholder="Search the log…" aria-label="Search the log" className="h-9 w-64" />
        <Input type="date" name="from" defaultValue={sp.from} aria-label="From date" className="h-9 w-40" />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" name="to" defaultValue={sp.to} aria-label="To date" className="h-9 w-40" />
        <Button type="submit" variant="outline">Apply</Button>
        {filtered && <Button asChild variant="ghost"><Link href="/activity">Clear</Link></Button>}
      </form>
      {items.length === 0 ? (
        <Card><p className="px-5 py-10 text-center text-sm text-muted-foreground">{filtered ? "No activity matches these filters." : "No activity yet. Changes you make will show up here."}</p></Card>
      ) : (
        <div className="space-y-4">
          {[...days.entries()].map(([k, list]) => (
            <Card key={k}>
              <h2 className="px-5 pt-4 text-[13px] font-semibold text-muted-foreground">{formatDate(new Date(`${k}T12:00:00Z`))} · {list.length}</h2>
              <ActivityList items={list} />
            </Card>
          ))}
          {hasMore && <div className="text-center"><Button asChild variant="outline"><Link href={href({ take: String(take + 100) })}>Load 100 more</Link></Button></div>}
        </div>
      )}
    </div>
  );
}
