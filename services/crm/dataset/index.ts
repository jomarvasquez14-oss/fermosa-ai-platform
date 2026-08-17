/**
 * CRM dataset generator (M0045) — public surface.
 *
 * Walks the `CRMConnector` seam (`@/services/crm`) read-only and writes a
 * reproducible, resumable on-disk dataset ("Dataset B") under a
 * caller-supplied directory. Reuses the connector seam and the snapshot
 * engine's hashing (`@/services/crm/snapshot`); introduces no new
 * architecture and touches no existing contract.
 */
export {
  generateDataset,
  metadataFor,
  resolveDatasetRoot,
  splitRecord,
  verifyGeneratedDataset,
  type GenerateOptions,
  type ProgressEvent,
} from "./dataset-generator";
export { verifyDataset, type VerifyReport, type VerifyIssue } from "./dataset-writer";
export type {
  DatasetDuplicate,
  DatasetFailure,
  DatasetManifest,
  DatasetMetadata,
  DatasetSnapshot,
} from "./manifest";
