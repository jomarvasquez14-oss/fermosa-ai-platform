"use server";

import { requirePermission } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { auditSubmissionService, type Actor } from "@/services/audit-submission-service";
import {
  getCRMConnector,
  type FindPatientsQuery,
  type FindPatientsResult,
  type NormalizedCrmPatientRecord,
  type RetrievalWindow,
} from "@/services/crm";
import {
  compareSnapshotMetadata,
  snapshotService,
  type EvidenceSnapshot,
  type SnapshotComparison,
  type SnapshotMetadata,
} from "@/services/crm/snapshot";

/**
 * /dev/snapshot actions (M0043) — Super Admin tooling for the Audit Evidence
 * Snapshot engine. Retrieval goes through `getCRMConnector()` (mock today,
 * playwright when configured); persistence goes through `snapshotService`.
 * Snapshots attach to a REAL AuditSubmission — evidence never floats free.
 */

export type SnapshotDevResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

async function getDevActor(): Promise<Actor> {
  const user = await requirePermission("playground:access");
  return { id: user.id, role: user.role, branchId: user.branchId ?? null };
}

function failure(error: unknown, fallback: string): { ok: false; error: string; code?: string } {
  if (isAppError(error)) return { ok: false, error: error.message, code: error.code };
  return { ok: false, error: fallback };
}

export interface SnapshotDevState {
  connectorKind: string;
  /** Recent submissions a snapshot can attach to (evidence needs an audit). */
  submissions: Array<{ id: string; branchName: string; auditDate: string; status: string }>;
}

export async function getSnapshotDevStateAction(): Promise<SnapshotDevState> {
  const actor = await getDevActor();
  const submissions = await auditSubmissionService.list(actor);
  return {
    connectorKind: getCRMConnector().kind,
    submissions: submissions.slice(0, 20).map((submission) => ({
      id: submission.id,
      branchName: submission.branch.name,
      auditDate: submission.auditDate.toISOString().slice(0, 10),
      status: submission.status,
    })),
  };
}

export async function snapshotFindPatientsAction(
  query: FindPatientsQuery
): Promise<SnapshotDevResult<FindPatientsResult>> {
  try {
    await getDevActor();
    return { ok: true, data: await getCRMConnector().findPatients(query) };
  } catch (error) {
    return failure(error, "Patient search failed unexpectedly. Check server logs.");
  }
}

export async function snapshotRetrieveLiveAction(
  crmId: string,
  window?: RetrievalWindow
): Promise<SnapshotDevResult<NormalizedCrmPatientRecord>> {
  try {
    await getDevActor();
    return { ok: true, data: await getCRMConnector().fetchPatientRecord(crmId, window) };
  } catch (error) {
    return failure(error, "Live CRM retrieval failed unexpectedly. Check server logs.");
  }
}

export async function snapshotCreateAction(input: {
  submissionId: string;
  crmId: string;
  window?: RetrievalWindow;
}): Promise<SnapshotDevResult<EvidenceSnapshot>> {
  try {
    await getDevActor();
    return { ok: true, data: await snapshotService.createSnapshot(input) };
  } catch (error) {
    return failure(error, "Snapshot creation failed unexpectedly. Check server logs.");
  }
}

export async function snapshotListAction(
  submissionId: string
): Promise<SnapshotDevResult<SnapshotMetadata[]>> {
  try {
    await getDevActor();
    return { ok: true, data: await snapshotService.listForSubmission(submissionId) };
  } catch (error) {
    return failure(error, "Snapshot listing failed unexpectedly. Check server logs.");
  }
}

export async function snapshotLoadAction(
  id: string
): Promise<SnapshotDevResult<EvidenceSnapshot>> {
  try {
    await getDevActor();
    return { ok: true, data: await snapshotService.loadSnapshot(id) };
  } catch (error) {
    return failure(error, "Snapshot load failed unexpectedly. Check server logs.");
  }
}

/** Load a snapshot, re-read the SAME patient/window live, compare metadata. */
export async function snapshotCompareAction(
  id: string
): Promise<SnapshotDevResult<SnapshotComparison>> {
  try {
    await getDevActor();
    const snapshot = await snapshotService.loadSnapshot(id);
    const live = await getCRMConnector().fetchPatientRecord(
      snapshot.metadata.crmPatientId,
      snapshot.metadata.window ?? undefined
    );
    return { ok: true, data: compareSnapshotMetadata(snapshot, live) };
  } catch (error) {
    return failure(error, "Snapshot comparison failed unexpectedly. Check server logs.");
  }
}
