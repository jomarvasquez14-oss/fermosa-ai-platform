import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/auth.config";

/**
 * Route protection (Edge runtime).
 *
 * All access decisions live in the `authorized` callback of
 * `lib/auth/auth.config.ts`:
 *   - unauthenticated users are redirected to /login
 *   - authenticated users hitting /login are sent to /dashboard
 *   - role-gated routes (see ROUTE_ACCESS in lib/auth/roles.ts) redirect
 *     to /forbidden when the role does not match
 */
export default NextAuth(authConfig).auth;

export const config = {
  // Protect everything except Next.js internals, static assets, and the auth API.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
