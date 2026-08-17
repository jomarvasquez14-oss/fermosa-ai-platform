/**
 * Dataset generator (M0045, expanded M0050) — shared types.
 *
 * `DatasetMetadata` is written as `metadata.json` beside every patient's
 * files; `DatasetManifest` is written once per dataset root and summarizes
 * one `generateDataset` run (CRM_DISCOVERY §7 provenance fields: connector
 * kind, selector/fixture version, retrieval timing).
 */

export interface DatasetMetadata {
  crmPatientId: string;
  connectorKind: string;
  selectorVersion: string;
  retrievedAt: string;
  /** SHA-256 over the full normalized record (== snapshot.json contentHash). */
  snapshotHash: string;
  /** SHA-256 over business sections only (drift comparison; ignores retrievedAt). */
  evidenceHash: string;
  /**
   * The CRM exposes no version string of its own. `selectorVersionOf`
   * (fixture/selector-map version) stands in as a documented proxy — see
   * `metadataFor` in `dataset-generator.ts`.
   */
  crmVersion: string;
  /**
   * Stamped ONLY when genuinely applied as a retrieval/derivation filter
   * (ADR-037) — i.e. in `branch` mode, where membership is derived from the
   * record's own treatment branches. Null in every other mode.
   */
  branch: string | null;
  window: { from: string; to: string } | null;
}

/** The reproducibility seal written as `snapshot.json` (M0050). */
export interface DatasetSnapshot {
  snapshotVersion: number;
  contentHash: string;
  evidenceHash: string;
  record: unknown;
}

export const DATASET_SNAPSHOT_VERSION = 1;

export interface DatasetFailure {
  crmId: string;
  code: string;
  message: string;
}

/** Same record content (contentHash) found under two or more crmIds. */
export interface DatasetDuplicate {
  contentHash: string;
  crmIds: string[];
}

export interface DatasetManifest {
  generatedAt: string;
  mode: string;
  connectorKind: string;
  selectorVersion: string;
  /** The genuinely-applied branch filter (branch mode), else null. */
  branch: string | null;
  window: { from: string; to: string } | null;
  /** Patients written to disk (passed any mode filter). */
  patients: string[];
  /** Enumerated but filtered out (branch/date modes) — recorded, not written. */
  skipped: string[];
  /** Patients enumerated before filtering (sweep modes); equals ids for patient mode. */
  enumeratedCount: number;
  /** Enumeration pages read (sweep modes); 0 for patient mode. */
  pageCount: number;
  retrievalDurationMs: number;
  duplicates: DatasetDuplicate[];
  failures: DatasetFailure[];
  warnings: string[];
  summary: {
    included: number;
    skipped: number;
    failed: number;
    totalBytes: number;
  };
}
