/**
 * Audit package (M0051) — shared types.
 *
 * An audit package bundles, for one branch and audit date, the evidence for a
 * set of patients: each patient's normalized record split into business files
 * plus a sealed `snapshot.json`, a package `manifest.json` with per-file
 * SHA-256 and each patient's evidence/content hash, an `audit-metadata.json`
 * (volatile provenance), and a `verification-report.json`.
 *
 * Reproducibility contract: the package's `packageHash` is derived ONLY from
 * the patients' `evidenceHash` values (business sections — ADR-035 — which
 * exclude `retrievedAt`), so the same CRM data yields the same `packageHash`
 * across runs. Volatile provenance (`generatedAt`, per-patient `retrievedAt`)
 * lives in `audit-metadata.json` and never feeds `packageHash`.
 */

export const AUDIT_PACKAGE_VERSION = 1;

/** The business files whose bytes are reproducible and manifest-hashed. */
export const BUSINESS_FILES = [
  "patient.json",
  "treatments.json",
  "invoice.json",
  "activity-log.json",
] as const;

export interface AuditPackageFileEntry {
  /** Package-root-relative POSIX path, e.g. "c-1001/patient.json". */
  path: string;
  sha256: string;
  bytes: number;
}

export interface AuditPackagePatientEntry {
  crmId: string;
  /** Business-section hash (reproducible; feeds packageHash). */
  evidenceHash: string;
  /** Full-record hash (includes retrievedAt; provenance only). */
  contentHash: string;
  files: AuditPackageFileEntry[];
}

export interface AuditPackageManifest {
  packageVersion: number;
  branch: string;
  auditDate: string;
  connectorKind: string;
  selectorVersion: string;
  window: { from: string; to: string } | null;
  patients: AuditPackagePatientEntry[];
  /** SHA-256 over the sorted patient evidence hashes — reproducible. */
  packageHash: string;
}

export interface AuditMetadata {
  /** Volatile — deliberately excluded from packageHash. */
  generatedAt: string;
  branch: string;
  auditDate: string;
  /** The explicit ids requested, or null for a date-range sweep. */
  requestedCrmIds: string[] | null;
  window: { from: string; to: string } | null;
  connectorKind: string;
  selectorVersion: string;
  patientCount: number;
  /** Per-patient retrieval timestamps — volatile provenance. */
  retrievedAt: Record<string, string>;
  /** Patients enumerated/requested but excluded (no in-window content). */
  skipped: string[];
  failures: Array<{ crmId: string; code: string; message: string }>;
}

export interface PatientVerification {
  crmId: string;
  ok: boolean;
  issues: string[];
}

export interface VerificationReport {
  branch: string;
  auditDate: string;
  packageHash: string;
  recomputedPackageHash: string;
  ok: boolean;
  patients: PatientVerification[];
}
