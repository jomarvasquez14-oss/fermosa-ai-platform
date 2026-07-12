"use client";

import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/shared/logo";
import { NavLinks } from "@/components/layout/nav-links";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { getNavForRole } from "@/lib/config/navigation";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/roles";

interface AppSidebarProps {
  role: AppRole;
}

/**
 * Desktop sidebar (hidden below `lg`; mobile uses the sheet in the top bar).
 * Client component: nav items carry Lucide icon components, which cannot be
 * serialized across the server -> client boundary.
 */
export function AppSidebar({ role }: AppSidebarProps) {
  const items = getNavForRole(role);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-16 items-center px-6">
        <Logo />
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto py-4">
        <NavLinks items={items} />
      </div>
      <Separator />
      <div className="space-y-2 p-4">
        <p className="px-3 text-xs text-muted-foreground">
          Signed in as <span className="font-medium">{ROLE_LABELS[role]}</span>
        </p>
        <SignOutButton />
      </div>
    </aside>
  );
}
