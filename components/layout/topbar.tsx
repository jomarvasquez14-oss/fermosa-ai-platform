"use client";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { MobileNav } from "@/components/layout/mobile-nav";
import { UserNav } from "@/components/layout/user-nav";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { getNavForRole } from "@/lib/config/navigation";
import type { AppRole } from "@/lib/auth/roles";

interface TopbarProps {
  user: {
    name: string;
    email: string;
    role: AppRole;
  };
}

export function Topbar({ user }: TopbarProps) {
  const navItems = getNavForRole(user.role);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6">
      <MobileNav items={navItems} />
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />
        <UserNav name={user.name} email={user.email} role={user.role} />
      </div>
    </header>
  );
}
