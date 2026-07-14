import { isAppError } from "@/lib/errors";
import { getCRMConnector } from "@/services/crm";
import type { CRMConnector } from "@/services/crm/crm-connector";
import { contentHash, selectorVersionOf } from "@/services/crm/snapshot";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";
import { hasExistingMetadata, readExistingMetadata, writeManifest, writePatientFiles } from "./dataset-writer";
import type { DatasetManifest, DatasetMetadata } from "./manifest";

/**
 * CRM dataset generator (M0045) — offline, read-only, resumable sweep of the
 * `CRMConnector` seam onto disk ("Dataset B"). Introduces no new
 * architecture: it is a client of the existing connector seam
 * (`@/services/crm`) and the audit evidence snapshot engine's hashing
 * (`@/services/crm/snapshot`, M0043/ADR-035). The CRM is never written to —
 * only `fetchPatientRecord` / `findPatients` are ever called.
 */

export interface GenerateOptions {
  mode: "patient" | "branch" | "dateRange" | "all";
  crmId?: string;
  branch?: string;
  window?: { from: string; to: string };
  outDir: string;
  resume: boolean;
}

/**
 * Splits one normalized record into the four on-disk sections. A pure
 * reshape — every value is copied verbatim from the record, nothing is
 * derived or renamed beyond the section keys themselves.
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
 * source in the CRM (it exposes no version string) — `selectorVersionOf`
 * (the fixture/selector-map version already used as evidence-snapshot
 * provenance, see `services/crm/snapshot/evidence.ts`) is reused as a
 * documented proxy rather than inventing a second, ungrounded field.
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
    crmVersion: selectorVersion,
    branch,
    window,
  };
}

/**
 * Resolves which crmIds this run should retrieve.
 *
 * `"patient"` mode is a direct, single-id fetch. The other modes are a
 * read-only identity SWEEP via `findPatients` — the only search primitive the
 * `CRMConnector` seam exposes (CRM_DISCOVERY §7); `FindPatientsQuery` has no
 * branch/date-range fields, so today this issues one generic empty-query call
 * for every non-"patient" mode, identically regardless of connector kind (no
 * mock special-casing). Over the MOCK connector an empty query is
 * intentionally "not-found" (it never lists "everyone"), so `"branch"` /
 * `"dateRange"` / `"all"` are exercised structurally against fixtures rather
 * than functionally; a live/browse connector can interpret `{}` as "sweep
 * everything" and return many candidates (or "ambiguous" with all of them).
 */
async function resolvePatientIds(opts: GenerateOptions, connector: CRMConnector): Promise<string[]> {
  if (opts.mode === "patient") {
    if (!opts.crmId) throw new Error('generateDataset: mode "patient" requires a crmId');
    return [opts.crmId];
  }

  const result = await connector.findPatients({});
  if (result.outcome === "not-found") return [];
  return result.candidates.map((candidate) => candidate.crmId);
}

/**
 * Runs one generation pass: resolves ids, retrieves each (unless already
 * retrieved and `resume` is set), writes the five per-patient files plus
 * `crm/manifest.json`, and returns that manifest.
 *
 * Never aborts on a single patient's failure — any error, whether an
 * `AppError` (e.g. the CRM's own `NOT_FOUND`) or a plain `Error` (e.g. a
 * write-side fs failure), is recorded in `manifest.failures` with a best-effort
 * `code` and the batch continues. This is still "fail loudly": every failure
 * is recorded, nothing is swallowed — it just doesn't abort the rest of the
 * batch.
 */
export async function generateDataset(
  opts: GenerateOptions,
  connector: CRMConnector = getCRMConnector()
): Promise<DatasetManifest> {
  const ids = await resolvePatientIds(opts, connector);

  const patients: string[] = [];
  const warnings: string[] = [];
  const failures: DatasetManifest["failures"] = [];
  let connectorKind: string = connector.kind;
  let selectorVersion = "";
  let retrievalDurationMs = 0;

  for (const crmId of ids) {
    if (opts.resume && hasExistingMetadata(opts.outDir, crmId)) {
      warnings.push(`skipped ${crmId}`);
      patients.push(crmId);
      // A fully-resumed run never reaches the success branch below, so
      // provenance would otherwise stay at its initial value (selectorVersion
      // stuck at ""). Backfill from the already-written metadata.json — only
      // if not already set — so the manifest still reflects reality.
      if (!selectorVersion || !connectorKind) {
        const existing = readExistingMetadata(opts.outDir, crmId);
        if (existing) {
          connectorKind = connectorKind || existing.connectorKind;
          selectorVersion = selectorVersion || existing.selectorVersion;
        }
      }
      continue;
    }

    const startedAt = performance.now();
    try {
      const record = await connector.fetchPatientRecord(crmId, opts.window);
      const sections = splitRecord(record);
      const metadata = metadataFor(record, opts.branch ?? null, opts.window ?? null);
      writePatientFiles(opts.outDir, crmId, sections, metadata);
      connectorKind = metadata.connectorKind;
      selectorVersion = metadata.selectorVersion;
      patients.push(crmId);
    } catch (error) {
      // Any failure — an AppError (e.g. the CRM's own NOT_FOUND) or a plain
      // Error (e.g. a write-side fs failure, or an unsafe crmId rejected by
      // writePatientFiles) — is recorded per-patient; the batch still
      // continues (see the doc comment above).
      failures.push({
        crmId,
        code: isAppError(error) ? error.code : "ERROR",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      retrievalDurationMs += performance.now() - startedAt;
    }
  }

  const manifest: DatasetManifest = {
    generatedAt: new Date().toISOString(),
    connectorKind,
    selectorVersion,
    patients,
    // One sweep call for non-"patient" modes (see resolvePatientIds); a
    // direct single-id fetch makes no sweep call at all.
    pageCount: opts.mode === "patient" ? 0 : 1,
    retrievalDurationMs: Math.round(retrievalDurationMs),
    failures,
    warnings,
  };

  writeManifest(opts.outDir, manifest);
  return manifest;
}
