import type { PutObjectOptions, StorageProviderKind, StoredObject } from "./types";

/**
 * Storage provider interface — the vendor-independence seam for binary
 * objects (Sprint 2A.2, ADR-024).
 *
 * The application depends ONLY on this interface and obtains an instance from
 * `getStorageProvider()` (`services/storage/index.ts`). Which backend is
 * active (local filesystem today; S3, Azure Blob, GCS, R2, Supabase later) is
 * configuration — no caller may reference a provider SDK or branch on the
 * provider kind.
 *
 * Contract notes for implementers:
 *  - Keys are opaque, internally generated, forward-slash-separated paths
 *    (e.g. "submissions/<submissionId>/<imageId>"). Implementations must
 *    reject keys that escape their namespace (path traversal).
 *  - `put` overwrites silently — idempotent by design so upload retries are
 *    safe (PROJECT_RULES: never lose uploaded metadata).
 *  - Failures throw `AppError` subclasses; `get` returns null for a missing
 *    key rather than throwing.
 *  - Objects are small (≤10 MB logbook images), so the Buffer-based API is
 *    deliberate; add a streaming API via ADR if large objects ever appear.
 */
export interface StorageProvider {
  readonly kind: StorageProviderKind;

  put(key: string, data: Buffer | Uint8Array, options?: PutObjectOptions): Promise<void>;

  /** Returns null when the key does not exist. */
  get(key: string): Promise<StoredObject | null>;

  exists(key: string): Promise<boolean>;

  /** Idempotent — deleting a missing key is a no-op. */
  delete(key: string): Promise<void>;
}
