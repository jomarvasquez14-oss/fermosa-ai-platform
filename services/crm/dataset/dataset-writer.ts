import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type { DatasetManifest, DatasetMetadata } from "./manifest";

/**
 * Dataset generator (M0045) — filesystem side, isolated from retrieval logic
 * so `dataset-generator.ts` stays unit-testable without touching disk shape
 * decisions. Every write lands under the caller-supplied `outDir`; nothing
 * here ever talks to the CRM.
 */

export interface PatientSections {
  patient: unknown;
  treatments: unknown[];
  invoice: unknown[];
  activityLog: unknown[];
}

export function patientDir(outDir: string, crmId: string): string {
  return path.join(outDir, "crm", crmId);
}

export function manifestPath(outDir: string): string {
  return path.join(outDir, "crm", "manifest.json");
}

function metadataPath(outDir: string, crmId: string): string {
  return path.join(patientDir(outDir, crmId), "metadata.json");
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/** Resume marker: a patient is considered already retrieved once this exists. */
export function hasExistingMetadata(outDir: string, crmId: string): boolean {
  return existsSync(metadataPath(outDir, crmId));
}

/**
 * Reads back a previously-written `metadata.json` for one crmId, if any.
 * Used to backfill manifest provenance (`connectorKind`/`selectorVersion`)
 * when a patient is skipped on a resumed run rather than freshly retrieved.
 */
export function readExistingMetadata(outDir: string, crmId: string): DatasetMetadata | null {
  const filePath = metadataPath(outDir, crmId);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as DatasetMetadata;
}

/**
 * Guards against a `crmId` that would escape the dataset tree when joined
 * into a path (path separators or `..` segments). Throws a plain `Error` —
 * the per-patient catch in `dataset-generator.ts` (Fix 3) records it into
 * `manifest.failures` rather than aborting the batch.
 */
function assertSafeCrmId(crmId: string): void {
  if (crmId.includes("/") || crmId.includes("\\") || crmId.includes("..")) {
    throw new Error(`writePatientFiles: unsafe crmId "${crmId}" (must not contain path separators or "..")`);
  }
}

/** Writes the five per-patient files (pretty JSON, 2-space) for one crmId. */
export function writePatientFiles(
  outDir: string,
  crmId: string,
  sections: PatientSections,
  metadata: DatasetMetadata
): void {
  assertSafeCrmId(crmId);
  const dir = patientDir(outDir, crmId);
  mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, "patient.json"), sections.patient);
  writeJson(path.join(dir, "treatments.json"), sections.treatments);
  writeJson(path.join(dir, "invoice.json"), sections.invoice);
  writeJson(path.join(dir, "activity-log.json"), sections.activityLog);
  // Written LAST — its presence is the resume marker other runs check for,
  // so a run that dies mid-write is retried in full rather than half-skipped.
  writeJson(metadataPath(outDir, crmId), metadata);
}

/** Writes `crm/manifest.json`, the single summary of one generator run. */
export function writeManifest(outDir: string, manifest: DatasetManifest): void {
  mkdirSync(path.join(outDir, "crm"), { recursive: true });
  writeJson(manifestPath(outDir), manifest);
}
