/**
 * Storage layer contracts — vendor-independent types (Sprint 2A.2, ADR-024).
 */

/**
 * Available providers. Only "local" is implemented today; the cloud providers
 * are declared so configuration and factory wiring never change when one
 * lands.
 */
export const STORAGE_PROVIDERS = ["local", "s3", "azure-blob", "gcs", "r2", "supabase"] as const;
export type StorageProviderKind = (typeof STORAGE_PROVIDERS)[number];

export interface PutObjectOptions {
  contentType?: string;
}

export interface StoredObject {
  data: Buffer;
  contentType?: string;
  sizeBytes: number;
}
