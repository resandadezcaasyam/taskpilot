"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import {
  BarChart3, CalendarDays, ChevronDown, Columns3, Compass, FlaskConical, FolderKanban, History, Hourglass,
  LayoutDashboard, ListChecks, Mail, Settings, Siren, Sun, Zap, type LucideIcon,
} from "lucide-react";
import { NAV_GROUPS, NAV_STATE_KEY, groupIdForPath, isActive, parseCollapsed, serializeCollapsed } from "@/lib/nav";
import { cn } from "@/lib/utils";

export const ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard, "list-checks": ListChecks, compass: Compass, sun: Sun,
  "folder-kanban": FolderKanban, "columns-3": Columns3, "flask-conical": FlaskConical, siren: Siren,
  hourglass: Hourglass, "calendar-days": CalendarDays, "bar-chart-3": BarChart3, history: History, settings: Settings, zap: Zap, mail: Mail,
};

/**
 * The sidebar menu: grouped, collapsible, and it remembers which groups you collapsed.
 *  - the server and the first paint show everything expanded (no flicker, no hydration mismatch);
 *  - right after loading, your saved choice is applied, except that the group holding the current page is always opened;
 *  - navigating to a page inside a collapsed group opens that group.
 */
export function SidebarNav({ pathname, badges, onNavigate }: { pathname: string; badges: Record<string, number>; onNavigate?: () => void }) {
  const uid = useId();
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const activeGroup = groupIdForPath(pathname);

  useEffect(() => {
    let stored: string[] = [];
    try {
      stored = parseCollapsed(localStorage.getItem(NAV_STATE_KEY));
    } catch { /* storage may be blocked; the menu simply starts expanded */ }
    setCollapsed(activeGroup ? stored.filter((id) => id !== activeGroup) : stored);
    setReady(true);
    // only on first load: later navigation is handled by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !activeGroup) return;
    setCollapsed((c) => (c.includes(activeGroup) ? c.filter((id) => id !== activeGroup) : c));
  }, [pathname, ready, activeGroup]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(NAV_STATE_KEY, serializeCollapsed(collapsed));
    } catch { /* ignore */ }
  }, [collapsed, ready]);

  const toggle = (id: string) => setCollapsed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <nav aria-label="Main" className="flex min-h-full flex-col gap-1 px-3 pb-4">
      {NAV_GROUPS.map((group) => {
        const open = !collapsed.includes(group.id);
        const containsActive = group.id === activeGroup;
        const hiddenBadges = group.items.reduce((n, i) => n + (badges[i.href] ?? 0), 0);
        const panelId = `${uid}-${group.id}`;
        return (
          // Settings (the System group) is pushed to the bottom and separated by a line when there is room
          <div key={group.id} className={cn(group.id === "system" && "mt-auto border-t border-border pt-2")}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => toggle(group.id)}
              className="group flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors duration-150 hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="flex-1 text-left">{group.label}</span>
              {!open && hiddenBadges > 0 && (
                <span className="min-w-5 rounded-full bg-red-500 px-1.5 text-center text-[10.5px] font-semibold normal-case leading-[18px] tracking-normal text-white" aria-label={`${hiddenBadges} reminders`}>
                  {hiddenBadges}
                </span>
              )}
              {!open && containsActive && <span className="size-1.5 rounded-full bg-primary" role="img" aria-label="Contains the current page" />}
              <ChevronDown aria-hidden className={cn("size-3.5 opacity-60 transition-all duration-200 group-hover:opacity-100 motion-reduce:transition-none", !open && "-rotate-90")} />
            </button>
            <div
              id={panelId}
              className={cn("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
            >
              <div className="min-h-0 overflow-hidden" aria-hidden={!open} inert={!open}>
                <ul className="flex flex-col gap-0.5 pb-1.5 pt-0.5">
                  {group.items.map((item) => {
                    const Icon = ICONS[item.icon];
                    const active = isActive(item.href, pathname);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
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
                          {item.phase && <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">P{item.phase}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
