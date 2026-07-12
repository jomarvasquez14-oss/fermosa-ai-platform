/**
 * Role and permission definitions.
 *
 * This module is EDGE-SAFE: it must not import Prisma or any Node-only
 * dependency, because it is consumed by `middleware.ts` (Edge runtime).
 *
 * Role values mirror the Prisma `RoleName` enum. They are duplicated here
 * (rather than imported from @prisma/client) to keep the Edge bundle clean.
 */

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  AUDITOR: "AUDITOR",
  BRANCH_MANAGER: "BRANCH_MANAGER",
} as const;

export type AppRole = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<AppRole, string> = {
  SUPER_ADMIN: "Super Admin",
  AUDITOR: "Auditor",
  BRANCH_MANAGER: "Branch Manager",
};

/**
 * Fine-grained permissions. Pages and services check these instead of
 * hard-coding role names, so the matrix below is the single source of truth.
 */
export const PERMISSIONS = {
  "dashboard:view": "dashboard:view",
  "audit:view": "audit:view",
  "audit:manage": "audit:manage",
  "crm:view": "crm:view",
  "reports:view": "reports:view",
  "branches:view-all": "branches:view-all",
  "branches:view-assigned": "branches:view-assigned",
  "branches:manage": "branches:manage",
  "users:manage": "users:manage",
  "settings:manage": "settings:manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  SUPER_ADMIN: Object.values(PERMISSIONS),
  AUDITOR: ["dashboard:view", "audit:view", "audit:manage", "reports:view", "branches:view-all"],
  BRANCH_MANAGER: ["dashboard:view", "audit:view", "branches:view-assigned"],
};

export function hasPermission(role: AppRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && value in ROLES;
}

/**
 * Route-level access control consumed by `middleware.ts`.
 * The first entry whose prefix matches the pathname wins.
 * Routes not listed here only require authentication.
 */
export const ROUTE_ACCESS: ReadonlyArray<{
  prefix: string;
  roles: readonly AppRole[];
}> = [
  { prefix: "/users", roles: [ROLES.SUPER_ADMIN] },
  { prefix: "/settings", roles: [ROLES.SUPER_ADMIN] },
  { prefix: "/reports", roles: [ROLES.SUPER_ADMIN, ROLES.AUDITOR] },
  {
    prefix: "/branches",
    roles: [ROLES.SUPER_ADMIN, ROLES.AUDITOR, ROLES.BRANCH_MANAGER],
  },
];

export function getAllowedRolesForPath(pathname: string): readonly AppRole[] | null {
  const match = ROUTE_ACCESS.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)
  );
  return match ? match.roles : null;
}
