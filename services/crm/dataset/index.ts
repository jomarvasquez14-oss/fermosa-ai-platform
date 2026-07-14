/**
 * CRM dataset generator (M0045) — public surface.
 *
 * Walks the `CRMConnector` seam (`@/services/crm`) read-only and writes a
 * reproducible, resumable on-disk dataset ("Dataset B") under a
 * caller-supplied directory. Reuses the connector seam and the snapshot
 * engine's hashing (`@/services/crm/snapshot`); introduces no new
 * architecture and touches no existing contract.
 */
export { generateDataset, metadataFor, splitRecord, type GenerateOptions } from "./dataset-generator";
export type { DatasetManifest, DatasetMetadata } from "./manifest";
