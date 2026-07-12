"use client";

import { LogOut } from "lucide-react";
import { signOutAction } from "@/features/auth/actions/sign-out";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => void signOutAction()}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        className
      )}
    >
      <LogOut className="size-4 shrink-0" aria-hidden="true" />
      Logout
    </button>
  );
}
