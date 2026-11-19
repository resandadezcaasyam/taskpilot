import Link from "next/link";
import { cn } from "@/lib/utils";

export function SettingsTabs({ active }: { active: "general" | "data" }) {
  return (
    <div className="flex gap-1 border-b border-border">
      {[{ href: "/settings", label: "General and scoring", key: "general" }, { href: "/settings/data", label: "Data and backup", key: "data" }].map((t) => (
        <Link key={t.key} href={t.href} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", active === t.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}</Link>
      ))}
    </div>
  );
}
