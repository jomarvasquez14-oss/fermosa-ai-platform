import {
  Building2,
  Camera,
  ClipboardCheck,
  DatabaseZap,
  FileBarChart,
  FlaskConical,
  Globe,
  LayoutDashboard,
  SearchCheck,
  Settings,
  Users,
  Contact,
  type LucideIcon,
} from "lucide-react";
import { ROLES, type AppRole } from "@/lib/auth/roles";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Roles allowed to see this item. Omit to show to every authenticated user. */
  roles?: readonly AppRole[];
}

/**
 * Sidebar navigation. Role visibility here must stay consistent with
 * `ROUTE_ACCESS` in `lib/auth/roles.ts` (middleware enforcement).
 */
export const MAIN_NAV: readonly NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Audit", href: "/audit", icon: ClipboardCheck },
  {
    title: "Findings",
    href: "/findings",
    icon: SearchCheck,
    roles: [ROLES.SUPER_ADMIN, ROLES.AUDITOR],
  },
  { title: "CRM", href: "/crm", icon: Contact },
  {
    title: "Reports",
    href: "/reports",
    icon: FileBarChart,
    roles: [ROLES.SUPER_ADMIN, ROLES.AUDITOR],
  },
  { title: "Branches", href: "/branches", icon: Building2 },
  { title: "Users", href: "/users", icon: Users, roles: [ROLES.SUPER_ADMIN] },
  { title: "Settings", href: "/settings", icon: Settings, roles: [ROLES.SUPER_ADMIN] },
  {
    title: "AI Playground",
    href: "/playground",
    icon: FlaskConical,
    roles: [ROLES.SUPER_ADMIN],
  },
  {
    title: "CRM Dev",
    href: "/dev/crm",
    icon: DatabaseZap,
    roles: [ROLES.SUPER_ADMIN],
  },
  {
    title: "Browser Dev",
    href: "/dev/browser",
    icon: Globe,
    roles: [ROLES.SUPER_ADMIN],
  },
  {
    title: "Snapshot Dev",
    href: "/dev/snapshot",
    icon: Camera,
    roles: [ROLES.SUPER_ADMIN],
  },
];

export function getNavForRole(role: AppRole): NavItem[] {
  return MAIN_NAV.filter((item) => !item.roles || item.roles.includes(role));
}
