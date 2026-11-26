import { BarChart3, Bell, Briefcase, FlaskConical, FolderKanban, LayoutDashboard, Settings, Users, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; /** Short label for the phone tab bar. */ short?: string };

/** The sidebar, grouped by what you do there. */
export const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [{ href: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard }] },
  {
    label: "Pipeline",
    items: [
      { href: "/jobs", label: "Job Applications", short: "Jobs", icon: Briefcase },
      { href: "/research", label: "Research Opportunities", short: "Research", icon: FlaskConical },
      { href: "/projects", label: "Research Projects", short: "Projects", icon: FolderKanban },
    ],
  },
  {
    label: "Organize",
    items: [
      { href: "/contacts", label: "Contacts", icon: Users },
      { href: "/reminders", label: "Reminders", icon: Bell },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings };

/** Every page, flat, for the command palette. */
export const NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
