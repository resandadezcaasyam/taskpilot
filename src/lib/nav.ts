export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Phase in which the module ships; undefined = available now. */
  phase?: number;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/** The sidebar, grouped by what you are doing: planning your day, managing tasks, operational work, reporting, system. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: "layout-dashboard" },
      { href: "/today", label: "Today Planner", icon: "sun" },
      { href: "/next-actions", label: "Next Actions", icon: "compass" },
    ],
  },
  {
    id: "planning",
    label: "Task & Planning",
    items: [
      { href: "/tasks", label: "My Tasks", icon: "list-checks" },
      { href: "/capture", label: "Brain Dump", icon: "zap" },
      { href: "/projects", label: "Projects", icon: "folder-kanban" },
      { href: "/kanban", label: "Kanban Board", icon: "columns-3" },
      { href: "/calendar", label: "Calendar", icon: "calendar-days" },
    ],
  },
  {
    id: "work",
    label: "Work Management",
    items: [
      { href: "/uat", label: "UAT Tracker", icon: "flask-conical" },
      { href: "/issues", label: "Issue & Escalation", icon: "siren" },
      { href: "/waiting", label: "Waiting & Blocked", icon: "hourglass" },
    ],
  },
  {
    id: "insights",
    label: "Insights & Reports",
    items: [
      { href: "/weekly", label: "Weekly Report", icon: "mail" },
      { href: "/analytics", label: "Analytics", icon: "bar-chart-3" },
      { href: "/activity", label: "Activity History", icon: "history" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [{ href: "/settings", label: "Settings", icon: "settings" }],
  },
];

/** Every menu item, in sidebar order. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** "/" only matches the dashboard itself; everything else also matches its sub-pages (/tasks/abc, /settings/data). */
export function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The group that contains the page being shown, or null for pages that are not in the menu (e.g. /search). */
export function groupIdForPath(pathname: string): string | null {
  return NAV_GROUPS.find((g) => g.items.some((i) => isActive(i.href, pathname)))?.id ?? null;
}

// ---------------------------------------------------------------- remembering which groups are collapsed

export const NAV_STATE_KEY = "taskpilot.sidebar.collapsed";

/** Reads the stored list of collapsed group ids, ignoring anything that is damaged or no longer exists. */
export function parseCollapsed(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const known = new Set(NAV_GROUPS.map((g) => g.id));
    return [...new Set(value.filter((v): v is string => typeof v === "string" && known.has(v)))];
  } catch {
    return [];
  }
}

export const serializeCollapsed = (ids: string[]): string => JSON.stringify([...new Set(ids)]);
