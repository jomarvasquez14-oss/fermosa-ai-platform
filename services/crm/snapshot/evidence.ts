import { createHash } from "crypto";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import {
  normalizedCrmPatientRecordSchema,
  type NormalizedCrmPatientRecord,
  type RetrievalWindow,
} from "@/services/crm/types";

/**
 * Audit evidence primitives (M0043, ADR-035) — the pure half of the snapshot
 * engine. No Prisma, no connector: everything here is deterministic and
 * unit-testable. The CRM stays the only source of truth; these functions only
 * fingerprint, validate, and compare EVIDENCE of what it said.
 */

/** Stored snapshot format. Bump via ADR when the persisted shape changes. */
export const SNAPSHOT_FORMAT_VERSION = 1;

/** The snapshot exists but its content is not a valid normalized record. */
export class EvidenceValidationError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super("EVIDENCE_INVALID", message, options);
  }
}

/** The stored record no longer matches its content hash — tampered/corrupt. */
export class EvidenceIntegrityError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super("EVIDENCE_INTEGRITY", message, options);
  }
}

export interface SnapshotMetadata {
  id: string;
  submissionId: string;
  crmPatientId: string;
  connectorKind: string;
  /** Selector-map version (browser connector) or fixture version (mock). */
  selectorVersion: string;
  snapshotVersion: number;
  /** ISO timestamp the connector stamped on the record. */
  retrievedAt: string;
  window: RetrievalWindow | null;
  contentHash: string;
  counts: { treatments: number; invoices: number; activity: number };
  createdAt: string;
}

export interface EvidenceSnapshot {
  metadata: SnapshotMetadata;
  record: NormalizedCrmPatientRecord;
}

/** Metadata-level snapshot ⇄ live comparison result. Never a finding. */
export interface SnapshotComparison {
  /** True when the business content (patient/treatments/invoices/activity)
   *  is byte-identical — provenance (retrievedAt, sourceRef) is ignored. */
  identical: boolean;
  /** Human-readable section deltas; empty when identical. */
  drift: string[];
  snapshot: ComparisonSide;
  live: ComparisonSide;
}

interface ComparisonSide {
  evidenceHash: string;
  retrievedAt: string;
  connectorKind: string;
  selectorVersion: string;
  counts: SnapshotMetadata["counts"];
}

/**
 * Deterministic JSON: object keys sorted, arrays in order. Required because
 * PostgreSQL jsonb does not preserve key order — hashing plain
 * `JSON.stringify` output would break on every load.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/**
 * Integrity hash over the FULL record (provenance included) — stored beside
 * the snapshot and re-verified on every load. A mismatch means the stored
 * evidence was altered after the fact.
 */
export function contentHash(record: NormalizedCrmPatientRecord): string {
  return createHash("sha256").update(stableStringify(record), "utf8").digest("hex");
}

/**
 * Content hash over the BUSINESS sections only (patient, treatments,
 * invoices, activity). Two retrievals of an unchanged patient produce equal
 * evidence hashes even though `retrievedAt` differs — this is what
 * live-vs-snapshot comparison uses.
 */
export function evidenceHash(record: NormalizedCrmPatientRecord): string {
  const { patient, treatments, invoices, activity } = record;
  return createHash("sha256")
    .update(stableStringify({ patient, treatments, invoices, activity }), "utf8")
    .digest("hex");
}

/**
 * The evidence boundary: everything persisted or loaded as a snapshot must be
 * a schema-valid NormalizedCrmPatientRecord (ADR-027). Malformed evidence is
 * rejected loudly, never stored or returned "best effort".
 */
export function validateSnapshotRecord(data: unknown): NormalizedCrmPatientRecord {
  try {
    return normalizedCrmPatientRecordSchema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new EvidenceValidationError(
        `Snapshot record failed schema validation: ${error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
        { cause: error }
      );
    }
    throw error;
  }
}

/** First token of sourceRef: "crm-selectors/v1" / "fixtures/v1" / …. */
export function selectorVersionOf(sourceRef: string): string {
  return sourceRef.trim().split(/\s+/)[0] ?? sourceRef;
}

export function recordCounts(record: NormalizedCrmPatientRecord): SnapshotMetadata["counts"] {
  return {
    treatments: record.treatments.length,
    invoices: record.invoices.length,
    activity: record.activity.length,
  };
}

/**
 * Compare a stored snapshot against a freshly retrieved live record —
 * metadata level only (hashes, counts, provenance). Interpreting drift is the
 * rule engine's job in a later milestone; this never produces findings.
 */
export function compareSnapshotMetadata(
  snapshot: EvidenceSnapshot,
  live: NormalizedCrmPatientRecord
): SnapshotComparison {
  const side = (record: NormalizedCrmPatientRecord): ComparisonSide => ({
    evidenceHash: evidenceHash(record),
    retrievedAt: record.retrievedAt,
    connectorKind: record.connectorKind,
    selectorVersion: selectorVersionOf(record.sourceRef),
    counts: recordCounts(record),
  });

  const snapshotSide = side(snapshot.record);
  const liveSide = side(live);
  const identical = snapshotSide.evidenceHash === liveSide.evidenceHash;

  const drift: string[] = [];
  if (!identical) {
    for (const section of ["treatments", "invoices", "activity"] as const) {
      if (snapshotSide.counts[section] !== liveSide.counts[section]) {
        drift.push(
          `${section}: ${snapshotSide.counts[section]} at snapshot time → ${liveSide.counts[section]} now`
        );
      }
    }
    if (evidencePatientHash(snapshot.record) !== evidencePatientHash(live)) {
      drift.push("patient demographics changed");
    }
    if (drift.length === 0) {
      drift.push("content changed within unchanged section counts (field-level edit)");
    }
  }

  return { identical, drift, snapshot: snapshotSide, live: liveSide };
}

function evidencePatientHash(record: NormalizedCrmPatientRecord): string {
  return createHash("sha256").update(stableStringify(record.patient), "utf8").digest("hex");
}
