"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getAuditService } from "@/services/audit";
import type { Actor } from "@/services/audit-submission-service";

/**
 * Orchestration actions (Sprint 3.6). Auditors/Super Admins drive audit runs;
 * everything goes through the AuditService seam (the orchestrator, ADR-029).
 */

export type OrchestratorResult = { ok: true } | { ok: false; error: string };

async function getManageActor(): Promise<Actor> {
  const user = await requirePermission("audit:manage");
  return { id: user.id, role: user.role, branchId: user.branchId ?? null };
}

function refresh(submissionId: string) {
  revalidatePath(`/audit/${submissionId}/progress`);
  revalidatePath(`/audit/${submissionId}`);
  revalidatePath("/audit");
}

function toError(error: unknown, fallback: string): OrchestratorResult {
  if (isAppError(error)) return { ok: false, error: error.message };
  logger.error(fallback, { error: error instanceof Error ? error.message : String(error) });
  return { ok: false, error: fallback };
}

export async function startAuditAction(submissionId: string): Promise<OrchestratorResult> {
  try {
    const actor = await getManageActor();
    await getAuditService().startAudit(actor, submissionId);
    refresh(submissionId);
    return { ok: true };
  } catch (error) {
    return toError(error, "Could not start the audit run.");
  }
}

export async function completeReviewStageAction(
  submissionId: string,
  jobId: string
): Promise<OrchestratorResult> {
  try {
    const actor = await getManageActor();
    await getAuditService().completeWaitingStage(actor, jobId);
    refresh(submissionId);
    return { ok: true };
  } catch (error) {
    return toError(error, "Could not complete the waiting stage.");
  }
}

export async function retryStageAction(
  submissionId: string,
  jobId: string
): Promise<OrchestratorResult> {
  try {
    const actor = await getManageActor();
    await getAuditService().retryStage(actor, jobId);
    refresh(submissionId);
    return { ok: true };
  } catch (error) {
    return toError(error, "Could not retry the failed stage.");
  }
}

export async function cancelRunAction(
  submissionId: string,
  jobId: string
): Promise<OrchestratorResult> {
  try {
    const actor = await getManageActor();
    await getAuditService().cancel(actor, jobId);
    refresh(submissionId);
    return { ok: true };
  } catch (error) {
    return toError(error, "Could not cancel the run.");
  }
}
