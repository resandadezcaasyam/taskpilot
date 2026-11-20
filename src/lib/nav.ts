export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Phase in which the module ships; undefined = available now. */
  phase?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "layout-dashboard" },
  { href: "/tasks", label: "My Tasks", icon: "list-checks" },
  { href: "/capture", label: "Brain Dump", icon: "zap" },
  { href: "/next-actions", label: "Next Actions", icon: "compass" },
  { href: "/weekly", label: "Weekly Report", icon: "mail" },
  { href: "/today", label: "Today Planner", icon: "sun" },
  { href: "/projects", label: "Projects", icon: "folder-kanban" },
  { href: "/kanban", label: "Kanban Board", icon: "columns-3" },
  { href: "/uat", label: "UAT Tracker", icon: "flask-conical" },
  { href: "/issues", label: "Issue & Escalation", icon: "siren" },
  { href: "/waiting", label: "Waiting & Blocked", icon: "hourglass" },
  { href: "/calendar", label: "Calendar", icon: "calendar-days" },
  { href: "/analytics", label: "Analytics", icon: "bar-chart-3" },
  { href: "/activity", label: "Activity History", icon: "history" },
  { href: "/settings", label: "Settings", icon: "settings" },
];
