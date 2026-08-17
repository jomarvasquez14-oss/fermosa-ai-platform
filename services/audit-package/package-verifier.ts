import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { evidenceHash, stableStringify } from "@/services/crm/snapshot";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";
import type {
  AuditPackageManifest,
  AuditPackagePatientEntry,
  PatientVerification,
  VerificationReport,
} from "./manifest";

/** SHA-256 over the sorted patient evidence hashes — the reproducible seal. */
export function computePackageHash(patients: AuditPackagePatientEntry[]): string {
  const basis = patients
    .map((p) => ({ crmId: p.crmId, evidenceHash: p.evidenceHash }))
    .sort((a, b) => (a.crmId < b.crmId ? -1 : a.crmId > b.crmId ? 1 : 0));
  return createHash("sha256").update(stableStringify(basis), "utf8").digest("hex");
}

/**
 * Audit package verifier (M0051) — pure filesystem re-hash of a built package.
 * Recomputes every manifest-listed file's SHA-256, re-derives each patient's
 * evidenceHash from the stored `snapshot.json` record, and recomputes the
 * package hash. A byte-level tamper of any evidence file, or a doctored
 * manifest, surfaces as a mismatch. Never contacts the CRM.
 */

function sha256File(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function verifyAuditPackage(packageRoot: string): VerificationReport {
  const manifestPath = path.join(packageRoot, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as AuditPackageManifest;

  const patients: PatientVerification[] = manifest.patients.map((entry) => {
    const issues: string[] = [];

    for (const file of entry.files) {
      const actual = sha256File(path.join(packageRoot, file.path));
      if (actual === null) {
        issues.push(`missing ${file.path}`);
      } else if (actual !== file.sha256) {
        issues.push(`sha256 mismatch: ${file.path}`);
      }
    }

    const snapshotPath = path.join(packageRoot, entry.crmId, "snapshot.json");
    if (!existsSync(snapshotPath)) {
      issues.push(`missing ${entry.crmId}/snapshot.json`);
    } else {
      try {
        const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
          record: NormalizedCrmPatientRecord;
        };
        const recomputed = evidenceHash(snapshot.record);
        if (recomputed !== entry.evidenceHash) {
          issues.push(`evidenceHash mismatch for ${entry.crmId}`);
        }
      } catch (error) {
        issues.push(
          `unreadable ${entry.crmId}/snapshot.json: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return { crmId: entry.crmId, ok: issues.length === 0, issues };
  });

  const recomputedPackageHash = computePackageHash(manifest.patients);
  const allPatientsOk = patients.every((p) => p.ok);

  return {
    branch: manifest.branch,
    auditDate: manifest.auditDate,
    packageHash: manifest.packageHash,
    recomputedPackageHash,
    ok: allPatientsOk && recomputedPackageHash === manifest.packageHash,
    patients,
  };
}
