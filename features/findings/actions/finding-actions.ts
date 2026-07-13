"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import type { FindingStatus } from "@/lib/findings";
import { findingService } from "@/services/finding-service";

/** Persisted finding workflow (Sprint 3.7) — Auditors/Super Admins. */
export type FindingActionResult = { ok: true } | { ok: false; error: string };

export async function transitionFindingAction(
  findingId: string,
  to: FindingStatus,
  resolution?: string
): Promise<FindingActionResult> {
  try {
    const user = await requirePermission("audit:manage");
    await findingService.transition(
      { id: user.id, role: user.role, branchId: user.branchId ?? null },
      findingId,
      to,
      resolution
    );
    revalidatePath("/findings");
    return { ok: true };
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message };
    return { ok: false, error: "Could not update the finding." };
  }
}
