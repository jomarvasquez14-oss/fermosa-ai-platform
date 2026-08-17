import path from "path";
import { existsSync, readFileSync } from "fs";
import { isAppError } from "@/lib/errors";
import { getCRMConnector } from "@/services/crm";
import type { CRMConnector } from "@/services/crm/crm-connector";
import { contentHash, evidenceHash, selectorVersionOf } from "@/services/crm/snapshot";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";
import {
  hasExistingMetadata,
  patientDirBytes,
  readExistingMetadata,
  verifyDataset,
  writeManifest,
  writePatientFiles,
  type VerifyReport,
} from "./dataset-writer";
import type { DatasetDuplicate, DatasetManifest, DatasetMetadata } from "./manifest";

/**
 * CRM dataset generator (M0045, expanded M0050) — offline, read-only,
 * resumable sweep of the `CRMConnector` seam onto disk ("Dataset B").
 * Introduces no new persistence: it is a client of the connector seam
 * (`@/services/crm`), the snapshot engine's hashing (`@/services/crm/snapshot`,
 * ADR-035), and the additive patient enumeration (ADR-037). The CRM is never
 * written to — only `fetchPatientRecord` / `listPatients` are ever called.
 *
 * Modes (ADR-037):
 *  - "patient"   — retrieve the given crmIds directly (one or many).
 *  - "all"       — enumerate the whole clinic, retrieve every patient.
 *  - "branch"    — enumerate all, retrieve each, keep only patients whose
 *                  record has a treatment at the named branch (DERIVED — the
 *                  live list cannot filter by branch server-side).
 *  - "dateRange" — enumerate all, retrieve each WINDOWED, keep only patients
 *                  with any in-window treatment/invoice/activity.
 */

export interface GenerateOptions {
  mode: "patient" | "branch" | "dateRange" | "all";
  /** patient mode: one or many ids. Ignored by sweep modes. */
  crmIds?: string[];
  /** branch mode: the branch whose patients to keep (derived membership). */
  branch?: string;
  /** dateRange mode window; also windows retrieval in any mode when set. */
  window?: { from: string; to: string };
  outDir: string;
  resume: boolean;
  /** Optional progress sink (the CLI wires ETA reporting to stderr). */
  onProgress?: (event: ProgressEvent) => void;
}

export interface ProgressEvent {
  phase: "enumerate" | "retrieve";
  done: number;
  /** null while the total is not yet known (enumeration in progress). */
  total: number | null;
  crmId?: string;
  elapsedMs: number;
  /** null when not yet estimable. */
  etaMs: number | null;
}

const ENUMERATION_PAGE_BUDGET = 1000;

/**
 * Resolves the mode-scoped dataset root under `outDir` (ADR-037 layout):
 *   patient   → <out>/crm/patient
 *   all       → <out>/crm/all
 *   branch    → <out>/crm/branch/<slug>
 *   dateRange → <out>/crm/date/<from>_<to>
 */
export function resolveDatasetRoot(opts: GenerateOptions): string {
  const base = path.join(opts.outDir, "crm");
  switch (opts.mode) {
    case "patient":
      return path.join(base, "patient");
    case "all":
      return path.join(base, "all");
    case "branch":
      return path.join(base, "branch", slug(opts.branch ?? "unspecified"));
    case "dateRange": {
      const w = opts.window;
      if (!w) throw new Error('generateDataset: mode "dateRange" requires --from/--to');
      return path.join(base, "date", `${w.from}_${w.to}`);
    }
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unspecified";
}

/**
 * Splits one normalized record into the four on-disk sections. A pure
 * reshape — every value is copied verbatim, nothing derived beyond the keys.
 */
export function splitRecord(record: NormalizedCrmPatientRecord): {
  patient: unknown;
  treatments: unknown[];
  invoice: unknown[];
  activityLog: unknown[];
} {
  return {
    patient: record.patient,
    treatments: record.treatments,
    invoice: record.invoices,
    activityLog: record.activity,
  };
}

/**
 * Builds the per-patient `metadata.json` content. `crmVersion` has no real
 * source in the CRM — `selectorVersionOf` (the selector-map/fixture version)
 * is reused as a documented proxy. `branch` is stamped ONLY when genuinely
 * applied (branch mode), never a merely-requested value (ADR-037).
 */
export function metadataFor(
  record: NormalizedCrmPatientRecord,
  branch: string | null,
  window: { from: string; to: string } | null
): DatasetMetadata {
  const selectorVersion = selectorVersionOf(record.sourceRef);
  return {
    crmPatientId: record.patient.crmId,
    connectorKind: record.connectorKind,
    selectorVersion,
    retrievedAt: record.retrievedAt,
    snapshotHash: contentHash(record),
    evidenceHash: evidenceHash(record),
    crmVersion: selectorVersion,
    branch,
    window,
  };
}

/** True when the record has a treatment at the named branch (id or name). */
function recordHasBranch(record: NormalizedCrmPatientRecord, branch: string): boolean {
  const target = slug(branch);
  return record.treatments.some(
    (t) => slug(t.branch.name) === target || slug(t.branch.crmBranchId) === target
  );
}

/** True when a windowed record carries any in-window content. */
function recordHasContent(record: NormalizedCrmPatientRecord): boolean {
  return record.treatments.length + record.invoices.length + record.activity.length > 0;
}

/**
 * Enumerates every patient id for a sweep mode via `connector.listPatients`
 * (ADR-037), page by page under a hard budget. Fails loudly if the connector
 * cannot enumerate — a sweep must never silently produce nothing.
 */
async function enumerateIds(
  connector: CRMConnector,
  onPage: (pageCount: number, seen: number) => void
): Promise<{ ids: string[]; pageCount: number }> {
  if (!connector.listPatients) {
    throw new Error(
      `The "${connector.kind}" connector does not support patient enumeration (listPatients) — ` +
        `sweep modes (branch/dateRange/all) need it. Use mode "patient" with explicit ids.`
    );
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  let pageCount = 0;
  for (let pageNo = 1; pageNo <= ENUMERATION_PAGE_BUDGET; pageNo++) {
    const page = await connector.listPatients(pageNo);
    pageCount = pageNo;
    for (const candidate of page.patients) {
      if (!seen.has(candidate.crmId)) {
        seen.add(candidate.crmId);
        ids.push(candidate.crmId);
      }
    }
    onPage(pageCount, ids.length);
    if (!page.hasNextPage) break;
  }
  return { ids, pageCount };
}

/**
 * Runs one generation pass. Resolves ids (direct for "patient", enumerated
 * for sweep modes), retrieves each (unless already retrieved and `resume` is
 * set), applies the mode's derived filter, writes the six per-patient files
 * plus the dataset-root `manifest.json`, and returns that manifest.
 *
 * Never aborts on a single patient's failure — any error (an `AppError` like
 * the CRM's `NOT_FOUND`, or a plain fs `Error`) is recorded in
 * `manifest.failures` and the batch continues. Still "fail loudly": every
 * failure is recorded, nothing swallowed.
 */
export async function generateDataset(
  opts: GenerateOptions,
  connector: CRMConnector = getCRMConnector()
): Promise<DatasetManifest> {
  const datasetRoot = resolveDatasetRoot(opts);
  const startedAt = performance.now();
  const isSweep = opts.mode !== "patient";
  const emit = opts.onProgress ?? (() => {});

  const branchFilter = opts.mode === "branch" ? (opts.branch ?? null) : null;
  if (opts.mode === "branch" && !branchFilter) {
    throw new Error('generateDataset: mode "branch" requires --branch');
  }

  let pageCount = 0;
  let ids: string[];
  if (isSweep) {
    const enumerated = await enumerateIds(connector, (pages, seen) => {
      pageCount = pages;
      emit({
        phase: "enumerate",
        done: seen,
        total: null,
        elapsedMs: performance.now() - startedAt,
        etaMs: null,
      });
    });
    ids = enumerated.ids;
    pageCount = enumerated.pageCount;
  } else {
    ids = opts.crmIds ?? [];
    if (ids.length === 0) {
      throw new Error('generateDataset: mode "patient" requires at least one crmId');
    }
  }

  const patients: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];
  const failures: DatasetManifest["failures"] = [];
  const hashToIds = new Map<string, string[]>();
  let connectorKind: string = connector.kind;
  let selectorVersion = "";
  let retrievalDurationMs = 0;
  let totalBytes = 0;

  for (let index = 0; index < ids.length; index++) {
    const crmId = ids[index]!;
    emit({
      phase: "retrieve",
      done: index,
      total: ids.length,
      crmId,
      elapsedMs: performance.now() - startedAt,
      etaMs: etaFor(index, ids.length, retrievalDurationMs),
    });

    if (opts.resume && hasExistingMetadata(datasetRoot, crmId)) {
      warnings.push(`skipped ${crmId} (resume)`);
      patients.push(crmId);
      // A fully-resumed run never reaches the success branch, so provenance
      // would stay at its initial value — backfill from the stored metadata.
      const existing = readExistingMetadata(datasetRoot, crmId);
      if (existing) {
        connectorKind = existing.connectorKind || connectorKind;
        if (!selectorVersion) selectorVersion = existing.selectorVersion;
        hashToIds.set(existing.snapshotHash, [
          ...(hashToIds.get(existing.snapshotHash) ?? []),
          crmId,
        ]);
      }
      totalBytes += patientDirBytes(datasetRoot, crmId);
      continue;
    }

    const at = performance.now();
    try {
      const record = await connector.fetchPatientRecord(crmId, opts.window);

      // Derived, per-mode filtering (ADR-037): branch/date are computed from
      // the record, never trusted from a server-side filter that doesn't exist.
      if (branchFilter && !recordHasBranch(record, branchFilter)) {
        skipped.push(crmId);
        continue;
      }
      if (opts.mode === "dateRange" && !recordHasContent(record)) {
        skipped.push(crmId);
        continue;
      }

      const sections = splitRecord(record);
      const metadata = metadataFor(record, branchFilter, opts.window ?? null);
      totalBytes += writePatientFiles(datasetRoot, crmId, sections, metadata, record);
      connectorKind = metadata.connectorKind;
      selectorVersion = metadata.selectorVersion;
      hashToIds.set(metadata.snapshotHash, [
        ...(hashToIds.get(metadata.snapshotHash) ?? []),
        crmId,
      ]);
      patients.push(crmId);
    } catch (error) {
      failures.push({
        crmId,
        code: isAppError(error) ? error.code : "ERROR",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      retrievalDurationMs += performance.now() - at;
    }
  }

  const duplicates: DatasetDuplicate[] = [...hashToIds.entries()]
    .filter(([, dupIds]) => dupIds.length > 1)
    .map(([hash, dupIds]) => ({ contentHash: hash, crmIds: dupIds }));
  if (duplicates.length > 0) {
    warnings.push(
      `${duplicates.length} duplicate record(s): identical content under multiple crmIds`
    );
  }

  emit({
    phase: "retrieve",
    done: ids.length,
    total: ids.length,
    elapsedMs: performance.now() - startedAt,
    etaMs: 0,
  });

  const manifest: DatasetManifest = {
    generatedAt: new Date().toISOString(),
    mode: opts.mode,
    connectorKind,
    selectorVersion,
    branch: branchFilter,
    window: opts.window ?? null,
    patients,
    skipped,
    enumeratedCount: ids.length,
    pageCount,
    retrievalDurationMs: Math.round(retrievalDurationMs),
    duplicates,
    failures,
    warnings,
    summary: {
      included: patients.length,
      skipped: skipped.length,
      failed: failures.length,
      totalBytes,
    },
  };

  writeManifest(datasetRoot, manifest);
  return manifest;
}

/** Linear ETA from mean per-patient time so far; null before the first done. */
function etaFor(done: number, total: number, elapsedMs: number): number | null {
  if (done <= 0) return null;
  const mean = elapsedMs / done;
  return Math.round(mean * (total - done));
}

/**
 * Re-hashes a previously generated dataset against its stored seals (M0050).
 * `crmIds` omitted → verify every patient the manifest recorded.
 */
export function verifyGeneratedDataset(opts: GenerateOptions, crmIds?: string[]): VerifyReport {
  const datasetRoot = resolveDatasetRoot(opts);
  const ids = crmIds ?? manifestPatients(datasetRoot);
  return verifyDataset(datasetRoot, ids);
}

function manifestPatients(datasetRoot: string): string[] {
  const filePath = path.join(datasetRoot, "manifest.json");
  if (!existsSync(filePath)) return [];
  try {
    const manifest = JSON.parse(readFileSync(filePath, "utf8")) as DatasetManifest;
    return manifest.patients ?? [];
  } catch {
    return [];
  }
}
