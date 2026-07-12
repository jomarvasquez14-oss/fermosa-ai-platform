import type { NextAuthConfig, Session } from "next-auth";
import { getAllowedRolesForPath, isAppRole } from "@/lib/auth/roles";

export const AUTH_PAGES = {
  signIn: "/login",
  forbidden: "/forbidden",
  defaultAfterLogin: "/dashboard",
} as const;

/** Public routes that never require a session. */
const PUBLIC_PATHS = ["/login", "/unauthorized", "/forbidden"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Edge-safe Auth.js configuration.
 *
 * Providers that need Prisma/bcrypt live in `lib/auth/index.ts` (Node runtime).
 * This file is imported by `middleware.ts`, so it must stay free of Node-only
 * dependencies.
 */
export const authConfig = {
  pages: {
    signIn: AUTH_PAGES.signIn,
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8, // 8-hour sessions for an internal tool
  },
  callbacks: {
    /** Runs in middleware for every matched request. */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = Boolean(auth?.user);

      // Send authenticated users away from the login page.
      if (isLoggedIn && pathname === AUTH_PAGES.signIn) {
        return Response.redirect(new URL(AUTH_PAGES.defaultAfterLogin, request.nextUrl));
      }

      if (isPublicPath(pathname)) return true;

      // Unauthenticated -> Auth.js redirects to the sign-in page.
      if (!isLoggedIn) return false;

      // Role-gated routes.
      const allowedRoles = getAllowedRolesForPath(pathname);
      if (allowedRoles) {
        const role = auth?.user?.role;
        if (!isAppRole(role) || !allowedRoles.includes(role)) {
          return Response.redirect(new URL(AUTH_PAGES.forbidden, request.nextUrl));
        }
      }

      return true;
    },
    jwt({ token, user }) {
      // `user` is only defined on initial sign-in.
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.branchId = user.branchId;
      }
      return token;
    },
    session({ session, token }) {
      // The middleware (Edge) build resolves a broader JWT type, so narrow here.
      session.user.id = token.id as string;
      session.user.role = token.role as Session["user"]["role"];
      session.user.branchId = (token.branchId as string | null) ?? null;
      return session;
    },
  },
  providers: [], // Filled in by lib/auth/index.ts (Node runtime only).
} satisfies NextAuthConfig;
