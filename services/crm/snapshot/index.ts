/**
 * Audit Evidence Snapshot engine (M0043, ADR-035).
 *
 * `evidence.ts`        — pure primitives: hashing, validation, comparison.
 * `snapshot-service.ts` — persistence: create / load / list (append-only).
 *
 * The CRM remains the only source of truth; this module stores immutable
 * evidence of what it said, never operational copies of it.
 */
export {
  compareSnapshotMetadata,
  contentHash,
  evidenceHash,
  EvidenceIntegrityError,
  EvidenceValidationError,
  recordCounts,
  selectorVersionOf,
  SNAPSHOT_FORMAT_VERSION,
  stableStringify,
  validateSnapshotRecord,
  type EvidenceSnapshot,
  type SnapshotComparison,
  type SnapshotMetadata,
} from "./evidence";
export { snapshotService, type CreateSnapshotInput } from "./snapshot-service";
