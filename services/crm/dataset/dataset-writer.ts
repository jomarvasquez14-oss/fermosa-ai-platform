import { existsSync, mkdirSync, writeFileSync } from "fs";
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

/** Writes the five per-patient files (pretty JSON, 2-space) for one crmId. */
export function writePatientFiles(
  outDir: string,
  crmId: string,
  sections: PatientSections,
  metadata: DatasetMetadata
): void {
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
