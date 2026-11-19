"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-controls";

export type FilterField =
  | { key: string; kind: "search"; placeholder: string }
  | { key: string; kind: "select"; label: string; options: { value: string; label: string }[] };

/** Search and select filters that live in the URL, so views are shareable and survive refreshes. */
export function UrlFilters({ basePath, current, fields }: { basePath: string; current: Record<string, string | undefined>; fields: FilterField[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const update = (changes: Record<string, string | undefined>) => {
    const next = { ...current, ...changes };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    start(() => router.replace(`${basePath}${params.size ? `?${params}` : ""}`));
  };
  const active = fields.some((f) => current[f.key]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {fields.map((f) =>
        f.kind === "search" ? (
          <form
            key={f.key}
            className="relative min-w-52 flex-1 sm:max-w-xs"
            onSubmit={(e) => {
              e.preventDefault();
              update({ [f.key]: String(new FormData(e.currentTarget).get(f.key) ?? "") || undefined });
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              key={current[f.key] ?? ""}
              name={f.key}
              defaultValue={current[f.key] ?? ""}
              placeholder={f.placeholder}
              aria-label={f.placeholder}
              className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground"
            />
          </form>
        ) : (
          <Select key={f.key} aria-label={f.label} value={current[f.key] ?? ""} onChange={(e) => update({ [f.key]: e.target.value || undefined })} className="h-9 w-44">
            <option value="">{f.label}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        ),
      )}
      {active && (
        <Button variant="ghost" size="sm" onClick={() => router.replace(basePath)}>Clear filters</Button>
      )}
    </div>
  );
}
