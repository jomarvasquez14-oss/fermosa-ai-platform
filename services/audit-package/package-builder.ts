import { createHash } from "crypto";
import { readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import { isAppError } from "@/lib/errors";
import { getCRMConnector } from "@/services/crm";
import type { CRMConnector } from "@/services/crm/crm-connector";
import { splitRecord } from "@/services/crm/dataset";
import { writePatientFiles } from "@/services/crm/dataset/dataset-writer";
import { metadataFor } from "@/services/crm/dataset/dataset-generator";
import { contentHash, evidenceHash } from "@/services/crm/snapshot";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";
import { computePackageHash, verifyAuditPackage } from "./package-verifier";
import {
  AUDIT_PACKAGE_VERSION,
  BUSINESS_FILES,
  type AuditMetadata,
  type AuditPackageFileEntry,
  type AuditPackageManifest,
  type AuditPackagePatientEntry,
  type VerificationReport,
} from "./manifest";

/**
 * Audit package builder (M0051) — composes the read-only CRM evidence for a
 * branch/audit-date into a reproducible, self-verifying on-disk package.
 * Introduces no new persistence and no new CRM access path: it reuses the
 * connector seam (enumeration ADR-037), the dataset writer (M0050), and the
 * snapshot engine's hashing (ADR-035). The DB evidence snapshots (M0043)
 * stay submission-owned and untouched — this is a FILE-based bundle for a
 * pilot audit workflow, not a second persistence layer.
 *
 * Layout: <outDir>/<branch-slug>/<auditDate>/
 *           <crmId>/{patient,treatments,invoice,activity-log,snapshot,metadata}.json
 *           manifest.json  audit-metadata.json  verification-report.json
 */

export interface BuildPackageOptions {
  branch: string;
  /** yyyy-mm-dd; defaults to today (UTC). */
  auditDate?: string;
  /** Explicit patients. Mutually exclusive with `window` sweeps. */
  crmIds?: string[];
  /** Date-range sweep: enumerate the clinic, keep in-window patients. */
  window?: { from: string; to: string };
  /** Package tree root, e.g. "audit-packages". */
  outDir: string;
}

export interface BuildPackageResult {
  packageRoot: string;
  manifest: AuditPackageManifest;
  metadata: AuditMetadata;
  verification: VerificationReport;
}

const ENUMERATION_PAGE_BUDGET = 1000;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unspecified";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function packageRootFor(opts: BuildPackageOptions): string {
  return path.join(opts.outDir, slug(opts.branch), opts.auditDate ?? today());
}

function sha256File(filePath: string): { sha256: string; bytes: number } {
  const buffer = readFileSync(filePath);
  return {
    sha256: createHash("sha256").update(buffer).digest("hex"),
    bytes: statSync(filePath).size,
  };
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function enumerateIds(connector: CRMConnector): Promise<string[]> {
  if (!connector.listPatients) {
    throw new Error(
      `The "${connector.kind}" connector cannot enumerate patients (listPatients) — ` +
        `a date-range audit package needs it. Pass explicit crmIds instead.`
    );
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let pageNo = 1; pageNo <= ENUMERATION_PAGE_BUDGET; pageNo++) {
    const page = await connector.listPatients(pageNo);
    for (const candidate of page.patients) {
      if (!seen.has(candidate.crmId)) {
        seen.add(candidate.crmId);
        ids.push(candidate.crmId);
      }
    }
    if (!page.hasNextPage) break;
  }
  return ids;
}

function hasContent(record: NormalizedCrmPatientRecord): boolean {
  return record.treatments.length + record.invoices.length + record.activity.length > 0;
}

export async function buildAuditPackage(
  opts: BuildPackageOptions,
  connector: CRMConnector = getCRMConnector()
): Promise<BuildPackageResult> {
  if ((opts.crmIds?.length ?? 0) === 0 && !opts.window) {
    throw new Error("buildAuditPackage: provide crmIds or a window (date range)");
  }
  const auditDate = opts.auditDate ?? today();
  const packageRoot = packageRootFor({ ...opts, auditDate });

  const requestedCrmIds = opts.crmIds ?? null;
  const ids = opts.crmIds ?? (await enumerateIds(connector));

  const patients: AuditPackagePatientEntry[] = [];
  const retrievedAt: Record<string, string> = {};
  const skipped: string[] = [];
  const failures: AuditMetadata["failures"] = [];
  let connectorKind = connector.kind as string;
  let selectorVersion = "";

  for (const crmId of ids) {
    let record: NormalizedCrmPatientRecord;
    try {
      record = await connector.fetchPatientRecord(crmId, opts.window);
    } catch (error) {
      failures.push({
        crmId,
        code: isAppError(error) ? error.code : "ERROR",
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    // Date-range sweeps keep only patients with in-window content.
    if (opts.window && !opts.crmIds && !hasContent(record)) {
      skipped.push(crmId);
      continue;
    }

    const sections = splitRecord(record);
    const metadata = metadataFor(record, null, opts.window ?? null);
    writePatientFiles(packageRoot, crmId, sections, metadata, record);
    connectorKind = metadata.connectorKind;
    selectorVersion = metadata.selectorVersion;
    retrievedAt[crmId] = record.retrievedAt;

    const files: AuditPackageFileEntry[] = BUSINESS_FILES.map((name) => {
      const { sha256, bytes } = sha256File(path.join(packageRoot, crmId, name));
      return { path: `${crmId}/${name}`, sha256, bytes };
    });
    patients.push({
      crmId,
      evidenceHash: evidenceHash(record),
      contentHash: contentHash(record),
      files,
    });
  }

  const manifest: AuditPackageManifest = {
    packageVersion: AUDIT_PACKAGE_VERSION,
    branch: opts.branch,
    auditDate,
    connectorKind,
    selectorVersion,
    window: opts.window ?? null,
    patients,
    packageHash: computePackageHash(patients),
  };
  writeJson(path.join(packageRoot, "manifest.json"), manifest);

  const metadata: AuditMetadata = {
    generatedAt: new Date().toISOString(),
    branch: opts.branch,
    auditDate,
    requestedCrmIds,
    window: opts.window ?? null,
    connectorKind,
    selectorVersion,
    patientCount: patients.length,
    retrievedAt,
    skipped,
    failures,
  };
  writeJson(path.join(packageRoot, "audit-metadata.json"), metadata);

  // Self-verify immediately so a package is never shipped unchecked.
  const verification = verifyAuditPackage(packageRoot);
  writeJson(path.join(packageRoot, "verification-report.json"), verification);

  return { packageRoot, manifest, metadata, verification };
}
