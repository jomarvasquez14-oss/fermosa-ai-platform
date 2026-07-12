import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Branch data-access service (foundation only).
 * Branch Managers must only ever see their assigned branch — keep that rule
 * here so every caller inherits it.
 */
export const branchService = {
  findAll() {
    return prisma.branch.findMany({ orderBy: { name: "asc" } });
  },

  findById(id: string) {
    return prisma.branch.findUnique({ where: { id } });
  },

  /** Scoped query for Branch Managers. */
  findAssigned(branchId: string | null) {
    if (!branchId) return Promise.resolve([]);
    return prisma.branch.findMany({ where: { id: branchId } });
  },
};
