"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3, CalendarDays, Columns3, Compass, FlaskConical, FolderKanban, History, Hourglass,
  LayoutDashboard, ListChecks, Menu, Moon, Plus, Search, Settings, Siren, Sun, X, Zap, type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { ReminderPoller, RemindersBell, type ReminderItem } from "@/components/reminders-ui";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { saveThemePreference } from "@/actions/settings";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard, "list-checks": ListChecks, compass: Compass, sun: Sun,
  "folder-kanban": FolderKanban, "columns-3": Columns3, "flask-conical": FlaskConical, siren: Siren,
  hourglass: Hourglass, "calendar-days": CalendarDays, "bar-chart-3": BarChart3, history: History, settings: Settings, zap: Zap,
};

export function AppShell({
  projects,
  reminders,
  badges,
  renderedDate,
  dbProblem = false,
  children,
}: {
  projects: { id: string; name: string }[];
  reminders: ReminderItem[];
  badges: Record<string, number>;
  renderedDate: string;
  dbProblem?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" jumps to the search box, like most web apps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const toggleTheme = () => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
    void saveThemePreference(next);
  };

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-0.5 px-3 pb-4">
      {NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMenuOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] transition-colors",
              active ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span className="flex-1">{item.label}</span>
            {(badges[item.href] ?? 0) > 0 && (
              <span className="min-w-5 rounded-full bg-red-500 px-1.5 text-center text-[10.5px] font-semibold leading-[18px] text-white" aria-label={`${badges[item.href]} reminders`}>
                {badges[item.href]}
              </span>
            )}
            {item.phase && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">P{item.phase}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-sidebar lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <p className="px-5 py-3 text-[11px] leading-snug text-muted-foreground">
          Local-first. Your data stays in <code className="font-mono">data/taskpilot.db</code>.
        </p>
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <aside className="relative flex h-full w-72 flex-col bg-sidebar shadow-xl">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
                <X />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
          </aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur md:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <Menu />
          </Button>
          <form action="/search" className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              name="q"
              type="search"
              placeholder="Search everything…  ( / )"
              aria-label="Search everything"
              className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground"
            />
          </form>
          <div className="ml-auto flex items-center gap-1.5">
            <RemindersBell reminders={reminders} />
            <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={toggleTheme}>
              <Sun className="hidden dark:block" />
              <Moon className="dark:hidden" />
            </Button>
            <Button onClick={() => setQuickAdd(true)}>
              <Plus />
              <span className="hidden sm:inline">Quick add</span>
            </Button>
          </div>
        </header>
        {dbProblem && (
          <div role="alert" className="border-b border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200 md:px-6">
            The local database is missing tables for this version. Stop the server and run{" "}
            <code className="rounded bg-red-100 px-1 py-0.5 font-mono text-xs dark:bg-red-900/50">npx prisma migrate dev --name phase3</code>, then start TaskPilot again. Your data is not lost.
          </div>
        )}
        <main className="mx-auto w-full max-w-[1180px] px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>

      <ReminderPoller renderedDate={renderedDate} />
      <TaskFormDialog open={quickAdd} onOpenChange={setQuickAdd} projects={projects} variant="quick" />
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-5 py-4">
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-[13px] font-bold text-primary-foreground">T</span>
      <span className="text-[15px] font-semibold tracking-tight">TaskPilot</span>
    </Link>
  );
}
