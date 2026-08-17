import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getCRMConnector, type NormalizedCrmPatientRecord, type RetrievalWindow } from "@/services/crm";
import type { CRMConnector } from "@/services/crm/crm-connector";
import {
  compareSnapshotMetadata,
  contentHash,
  EvidenceIntegrityError,
  recordCounts,
  selectorVersionOf,
  SNAPSHOT_FORMAT_VERSION,
  validateSnapshotRecord,
  type EvidenceSnapshot,
  type SnapshotMetadata,
} from "./evidence";

/**
 * SnapshotService (M0043, ADR-035) — immutable audit evidence.
 *
 * The CRM remains the ONLY source of truth. This service never synchronizes,
 * mirrors, or updates CRM data: it captures what the connector returned at
 * one moment, seals it with a content hash, and preserves it so the audit
 * that used it stays reproducible. Rows are append-only — the service exposes
 * no update or delete, and snapshots leave the database only when their
 * owning submission is deleted (cascade).
 */

export interface CreateSnapshotInput {
  /** The audit submission this evidence belongs to — the only link allowed. */
  submissionId: string;
  /** The CRM's patient id, exactly as the connector understands it. */
  crmId: string;
  /** Inclusive date window applied to treatments/invoices/activity. */
  window?: RetrievalWindow;
}

type SnapshotRow = Prisma.AuditEvidenceSnapshotGetPayload<Record<string, never>>;

function toMetadata(row: SnapshotRow, record: NormalizedCrmPatientRecord): SnapshotMetadata {
  return {
    id: row.id,
    submissionId: row.submissionId,
    crmPatientId: row.crmPatientId,
    connectorKind: row.connectorKind,
    selectorVersion: row.selectorVersion,
    snapshotVersion: row.snapshotVersion,
    retrievedAt: row.retrievedAt.toISOString(),
    window: row.windowFrom && row.windowTo ? { from: row.windowFrom, to: row.windowTo } : null,
    contentHash: row.contentHash,
    counts: recordCounts(record),
    createdAt: row.createdAt.toISOString(),
  };
}

export const snapshotService = {
  /**
   * Read the live CRM through the connector seam and seal the result as
   * immutable evidence. The record is schema-validated BEFORE persisting —
   * malformed evidence is rejected, never stored.
   */
  async createSnapshot(
    input: CreateSnapshotInput,
    connector: CRMConnector = getCRMConnector()
  ): Promise<EvidenceSnapshot> {
    const submission = await prisma.auditSubmission.findUnique({
      where: { id: input.submissionId },
      select: { id: true },
    });
    if (!submission) throw new NotFoundError("Audit submission");

    const record = validateSnapshotRecord(
      await connector.fetchPatientRecord(input.crmId, input.window)
    );

    const row = await prisma.auditEvidenceSnapshot.create({
      data: {
        submissionId: input.submissionId,
        crmPatientId: record.patient.crmId,
        record: record as unknown as Prisma.InputJsonValue,
        contentHash: contentHash(record),
        connectorKind: record.connectorKind,
        selectorVersion: selectorVersionOf(record.sourceRef),
        retrievedAt: new Date(record.retrievedAt),
        windowFrom: input.window?.from ?? null,
        windowTo: input.window?.to ?? null,
        snapshotVersion: SNAPSHOT_FORMAT_VERSION,
      },
    });

    logger.info("Audit evidence snapshot created", {
      snapshotId: row.id,
      submissionId: input.submissionId,
      crmPatientId: record.patient.crmId,
      connectorKind: record.connectorKind,
      contentHash: row.contentHash,
    });

    return { metadata: toMetadata(row, record), record };
  },

  /**
   * Load one snapshot and prove it is still trustworthy evidence: the stored
   * JSON must parse against the ADR-027 schema AND match its content hash.
   * Either failure is loud — corrupted evidence must never flow onward.
   */
  async loadSnapshot(id: string): Promise<EvidenceSnapshot> {
    const row = await prisma.auditEvidenceSnapshot.findUnique({ where: { id } });
    if (!row) throw new NotFoundError("Evidence snapshot");

    const record = validateSnapshotRecord(row.record);
    const hash = contentHash(record);
    if (hash !== row.contentHash) {
      throw new EvidenceIntegrityError(
        `Snapshot ${id} failed its integrity check: stored hash ${row.contentHash} ` +
          `does not match recomputed hash ${hash}. The evidence was altered after capture.`
      );
    }

    return { metadata: toMetadata(row, record), record };
  },

  /** Snapshot metadata for a submission, newest first (list views). */
  async listForSubmission(submissionId: string): Promise<SnapshotMetadata[]> {
    const rows = await prisma.auditEvidenceSnapshot.findMany({
      where: { submissionId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => toMetadata(row, validateSnapshotRecord(row.record)));
  },

  /** Schema-validate arbitrary data as snapshot evidence (pure delegate). */
  validateSnapshot: validateSnapshotRecord,

  /** Metadata-level snapshot ⇄ live comparison (pure delegate; no findings). */
  compareSnapshotMetadata,
};
