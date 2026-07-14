import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import { contentHash, evidenceHash } from "@/services/crm/snapshot";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";
import {
  DATASET_SNAPSHOT_VERSION,
  type DatasetManifest,
  type DatasetMetadata,
  type DatasetSnapshot,
} from "./manifest";

/**
 * Dataset generator (M0045, expanded M0050) — filesystem side, isolated from
 * retrieval logic so `dataset-generator.ts` stays unit-testable without
 * touching disk-shape decisions. Every write lands under the caller-supplied
 * dataset ROOT (already mode-scoped, e.g. `<out>/crm/branch/<slug>`); nothing
 * here ever talks to the CRM.
 */

export interface PatientSections {
  patient: unknown;
  treatments: unknown[];
  invoice: unknown[];
  activityLog: unknown[];
}

/** Per-patient directory under a resolved dataset root. */
export function patientDir(datasetRoot: string, crmId: string): string {
  return path.join(datasetRoot, crmId);
}

export function manifestPath(datasetRoot: string): string {
  return path.join(datasetRoot, "manifest.json");
}

function metadataPath(datasetRoot: string, crmId: string): string {
  return path.join(patientDir(datasetRoot, crmId), "metadata.json");
}

function snapshotPath(datasetRoot: string, crmId: string): string {
  return path.join(patientDir(datasetRoot, crmId), "snapshot.json");
}

/** Serialize with a trailing newline; returns the byte length written. */
function writeJson(filePath: string, data: unknown): number {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  writeFileSync(filePath, body, "utf8");
  return Buffer.byteLength(body, "utf8");
}

/** Resume marker: a patient is considered already retrieved once this exists. */
export function hasExistingMetadata(datasetRoot: string, crmId: string): boolean {
  return existsSync(metadataPath(datasetRoot, crmId));
}

/**
 * Reads back a previously-written `metadata.json` for one crmId, if any.
 * Used to backfill manifest provenance (`connectorKind`/`selectorVersion`)
 * when a patient is skipped on a resumed run rather than freshly retrieved.
 */
export function readExistingMetadata(datasetRoot: string, crmId: string): DatasetMetadata | null {
  const filePath = metadataPath(datasetRoot, crmId);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as DatasetMetadata;
}

/**
 * Guards against a `crmId` that would escape the dataset tree when joined
 * into a path (path separators or `..` segments). Throws a plain `Error` —
 * the per-patient catch in `dataset-generator.ts` records it into
 * `manifest.failures` rather than aborting the batch.
 */
function assertSafeCrmId(crmId: string): void {
  if (crmId.includes("/") || crmId.includes("\\") || crmId.includes("..")) {
    throw new Error(
      `writePatientFiles: unsafe crmId "${crmId}" (must not contain path separators or "..")`
    );
  }
}

/**
 * Writes the six per-patient files (pretty JSON, 2-space) for one crmId and
 * returns the total bytes written. `snapshot.json` carries the full record
 * plus both hashes — the reproducibility seal (M0050), reusing the snapshot
 * engine's hashing (ADR-035).
 */
export function writePatientFiles(
  datasetRoot: string,
  crmId: string,
  sections: PatientSections,
  metadata: DatasetMetadata,
  record: NormalizedCrmPatientRecord
): number {
  assertSafeCrmId(crmId);
  const dir = patientDir(datasetRoot, crmId);
  mkdirSync(dir, { recursive: true });
  let bytes = 0;
  bytes += writeJson(path.join(dir, "patient.json"), sections.patient);
  bytes += writeJson(path.join(dir, "treatments.json"), sections.treatments);
  bytes += writeJson(path.join(dir, "invoice.json"), sections.invoice);
  bytes += writeJson(path.join(dir, "activity-log.json"), sections.activityLog);
  const snapshot: DatasetSnapshot = {
    snapshotVersion: DATASET_SNAPSHOT_VERSION,
    contentHash: metadata.snapshotHash,
    evidenceHash: metadata.evidenceHash,
    record,
  };
  bytes += writeJson(snapshotPath(datasetRoot, crmId), snapshot);
  // Written LAST — its presence is the resume marker other runs check for,
  // so a run that dies mid-write is retried in full rather than half-skipped.
  bytes += writeJson(metadataPath(datasetRoot, crmId), metadata);
  return bytes;
}

/** Writes `<datasetRoot>/manifest.json`, the single summary of one run. */
export function writeManifest(datasetRoot: string, manifest: DatasetManifest): void {
  mkdirSync(datasetRoot, { recursive: true });
  writeJson(manifestPath(datasetRoot), manifest);
}

export interface VerifyIssue {
  crmId: string;
  kind: "missing" | "unreadable" | "content-hash" | "evidence-hash" | "metadata-hash";
  detail: string;
}

export interface VerifyReport {
  datasetRoot: string;
  checked: number;
  ok: number;
  issues: VerifyIssue[];
}

/**
 * Re-hashes every patient's stored `snapshot.json` and checks it against both
 * the seal it carries and the `metadata.json` beside it (M0050 hash
 * verification). A byte-level tamper of any record file surfaces as a
 * content/evidence/metadata hash mismatch. Pure filesystem — no CRM contact.
 */
export function verifyDataset(datasetRoot: string, crmIds: string[]): VerifyReport {
  const issues: VerifyIssue[] = [];
  let ok = 0;
  for (const crmId of crmIds) {
    const snapPath = snapshotPath(datasetRoot, crmId);
    if (!existsSync(snapPath)) {
      issues.push({ crmId, kind: "missing", detail: `no snapshot.json at ${snapPath}` });
      continue;
    }
    let snapshot: DatasetSnapshot;
    try {
      snapshot = JSON.parse(readFileSync(snapPath, "utf8")) as DatasetSnapshot;
    } catch (error) {
      issues.push({
        crmId,
        kind: "unreadable",
        detail: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const record = snapshot.record as NormalizedCrmPatientRecord;
    const recomputedContent = contentHash(record);
    const recomputedEvidence = evidenceHash(record);
    let clean = true;
    if (recomputedContent !== snapshot.contentHash) {
      clean = false;
      issues.push({
        crmId,
        kind: "content-hash",
        detail: `snapshot.json record does not match its own contentHash`,
      });
    }
    if (recomputedEvidence !== snapshot.evidenceHash) {
      clean = false;
      issues.push({
        crmId,
        kind: "evidence-hash",
        detail: `snapshot.json record does not match its own evidenceHash`,
      });
    }
    const metadata = readExistingMetadata(datasetRoot, crmId);
    if (metadata && metadata.snapshotHash !== recomputedContent) {
      clean = false;
      issues.push({
        crmId,
        kind: "metadata-hash",
        detail: `metadata.json snapshotHash disagrees with the recomputed record hash`,
      });
    }
    if (clean) ok++;
  }
  return { datasetRoot, checked: crmIds.length, ok, issues };
}

/** Total bytes of a patient directory's files (best-effort; for summaries). */
export function patientDirBytes(datasetRoot: string, crmId: string): number {
  const dir = patientDir(datasetRoot, crmId);
  let total = 0;
  for (const name of ["patient.json", "treatments.json", "invoice.json", "activity-log.json", "snapshot.json", "metadata.json"]) {
    const filePath = path.join(dir, name);
    if (existsSync(filePath)) total += statSync(filePath).size;
  }
  return total;
}
