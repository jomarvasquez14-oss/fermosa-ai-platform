import "server-only";
import { getServerEnv } from "@/lib/config/env";
import { NotImplementedError } from "@/lib/errors";
import { LocalStorageProvider } from "./local-storage-provider";
import type { StorageProvider } from "./storage-provider";
import type { StorageProviderKind } from "./types";

export type { StorageProvider } from "./storage-provider";
export * from "./types";

let cached: StorageProvider | null = null;

/**
 * Storage provider factory — the single place a backend is chosen (ADR-024).
 * Selection order: explicit argument > `STORAGE_PROVIDER` env var > "local".
 * The instance is cached; providers must be stateless per call.
 */
export function getStorageProvider(kind?: StorageProviderKind): StorageProvider {
  const env = getServerEnv();
  const selected = kind ?? env.STORAGE_PROVIDER;

  if (!kind && cached && cached.kind === selected) return cached;

  let provider: StorageProvider;
  switch (selected) {
    case "local":
      provider = new LocalStorageProvider(env.STORAGE_LOCAL_ROOT);
      break;
    case "s3":
    case "azure-blob":
    case "gcs":
    case "r2":
    case "supabase":
      throw new NotImplementedError(`Storage provider "${selected}"`, "future milestone");
  }

  if (!kind) cached = provider;
  return provider;
}
