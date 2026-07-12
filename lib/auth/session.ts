import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AUTH_PAGES } from "@/lib/auth/auth.config";
import { hasPermission, type AppRole, type Permission } from "@/lib/auth/roles";

/**
 * Server-side session guards for pages, layouts, and server actions.
 * Middleware already protects routes; these helpers add defense in depth
 * and give pages typed access to the current user.
 */

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/** Redirects to /login when unauthenticated. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect(AUTH_PAGES.signIn);
  return user;
}

/** Redirects to /forbidden when the user lacks one of the allowed roles. */
export async function requireRole(...allowedRoles: AppRole[]) {
  const user = await requireUser();
  if (!allowedRoles.includes(user.role)) redirect(AUTH_PAGES.forbidden);
  return user;
}

/** Redirects to /forbidden when the user lacks the given permission. */
export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (!hasPermission(user.role, permission)) redirect(AUTH_PAGES.forbidden);
  return user;
}
