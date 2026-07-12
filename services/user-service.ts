import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * User data-access service.
 *
 * Services are the only layer that talks to Prisma. Pages, server actions,
 * and API routes call services — never the ORM directly — so data-access
 * rules stay in one place as the platform grows.
 */
export const userService = {
  findByEmailWithRole(email: string) {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { role: true },
    });
  },

  findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { role: true, branch: true },
    });
  },
};
