/**
 * Dataset generator (M0045) — shared types.
 *
 * `DatasetMetadata` is written as `metadata.json` beside every patient's
 * files; `DatasetManifest` is written once as `crm/manifest.json` and
 * summarizes one `generateDataset` run (CRM_DISCOVERY §7 provenance fields:
 * connector kind, selector/fixture version, retrieval timing).
 */

export interface DatasetMetadata {
  crmPatientId: string;
  connectorKind: string;
  selectorVersion: string;
  retrievedAt: string;
  snapshotHash: string;
  /**
   * The CRM exposes no version string of its own. `selectorVersionOf`
   * (fixture/selector-map version) stands in as a documented proxy — see
   * `metadataFor` in `dataset-generator.ts`.
   */
  crmVersion: string;
  branch: string | null;
  window: { from: string; to: string } | null;
}

export interface DatasetManifest {
  generatedAt: string;
  connectorKind: string;
  selectorVersion: string;
  patients: string[];
  pageCount: number;
  retrievalDurationMs: number;
  failures: Array<{ crmId: string; code: string; message: string }>;
  warnings: string[];
}
