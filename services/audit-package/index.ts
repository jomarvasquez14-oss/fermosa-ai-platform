/**
 * Audit package (M0051) — public surface.
 *
 * Builds a reproducible, self-verifying on-disk evidence bundle for a
 * branch/audit-date from the read-only CRM seam. Reuses the connector
 * (ADR-037), the dataset writer (M0050), and the snapshot hashing (ADR-035);
 * introduces no new persistence and leaves the submission-owned DB snapshots
 * (M0043) untouched.
 */
export {
  buildAuditPackage,
  packageRootFor,
  type BuildPackageOptions,
  type BuildPackageResult,
} from "./package-builder";
export { verifyAuditPackage, computePackageHash } from "./package-verifier";
export {
  AUDIT_PACKAGE_VERSION,
  BUSINESS_FILES,
  type AuditMetadata,
  type AuditPackageFileEntry,
  type AuditPackageManifest,
  type AuditPackagePatientEntry,
  type PatientVerification,
  type VerificationReport,
} from "./manifest";
