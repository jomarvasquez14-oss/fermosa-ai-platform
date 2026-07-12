import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { authConfig } from "@/lib/auth/auth.config";
import { isAppRole } from "@/lib/auth/roles";
import { loginSchema } from "@/features/auth/schemas/login-schema";
import { userService } from "@/services/user-service";
import { logger } from "@/lib/logger";

/**
 * Full Auth.js instance (Node runtime).
 *
 * Extends the edge-safe `authConfig` with the Credentials provider, which
 * needs Prisma and bcrypt. `middleware.ts` must import `auth.config.ts`
 * directly — never this file.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await userService.findByEmailWithRole(email);

        if (!user || user.status !== "ACTIVE") {
          logger.warn("Login rejected: unknown or inactive user", { email });
          return null;
        }

        const passwordMatches = await compare(password, user.passwordHash);
        if (!passwordMatches) {
          logger.warn("Login rejected: invalid password", { email });
          return null;
        }

        if (!isAppRole(user.role.name)) {
          logger.error("Login rejected: user has unrecognized role", {
            email,
            role: user.role.name,
          });
          return null;
        }

        logger.info("User signed in", { userId: user.id });

        return {
          id: user.id,
          name: user.fullName,
          email: user.email,
          role: user.role.name,
          branchId: user.branchId,
        };
      },
    }),
  ],
});
