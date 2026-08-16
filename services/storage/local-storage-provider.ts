import { promises as fs } from "fs";
import path from "path";
import { AppError } from "@/lib/errors";
import type { StorageProvider } from "./storage-provider";
import type { PutObjectOptions, StoredObject } from "./types";

/**
 * Local filesystem storage provider — the development/on-prem backend.
 *
 * Layout: `<root>/<key>` for the binary plus `<root>/<key>.meta.json` for
 * the content type (filesystems have no metadata channel; cloud providers
 * store this natively). The root directory is created lazily.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly kind = "local" as const;
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  /**
   * Resolve a key inside the root, rejecting traversal attempts.
   *
   * Keys are a platform-independent, forward-slash-separated namespace (see
   * the `StorageProvider` contract). A backslash is a path separator on
   * Windows but an ordinary filename character on POSIX, so passing the raw
   * key to `path.resolve()` would make the traversal verdict host-dependent:
   * `..\..\windows\system32` escapes the root on Windows yet lands inside it
   * as one oddly-named file on Linux. Normalize separators first so every
   * host reaches the same verdict for the same key.
   */
  private resolveKey(key: string): string {
    if (!key || key.includes("\0")) {
      throw new AppError("STORAGE_INVALID_KEY", "Storage key is empty or malformed.");
    }
    const resolved = path.resolve(this.root, key.replace(/\\/g, "/"));
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new AppError("STORAGE_INVALID_KEY", `Storage key escapes the storage root: ${key}`);
    }
    return resolved;
  }

  private metaPath(filePath: string): string {
    return `${filePath}.meta.json`;
  }

  async put(key: string, data: Buffer | Uint8Array, options?: PutObjectOptions): Promise<void> {
    const filePath = this.resolveKey(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    if (options?.contentType) {
      await fs.writeFile(
        this.metaPath(filePath),
        JSON.stringify({ contentType: options.contentType })
      );
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    const filePath = this.resolveKey(key);
    let data: Buffer;
    try {
      data = await fs.readFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }

    let contentType: string | undefined;
    try {
      const meta = JSON.parse(await fs.readFile(this.metaPath(filePath), "utf8")) as {
        contentType?: string;
      };
      contentType = meta.contentType;
    } catch {
      // Missing/corrupt sidecar metadata is non-fatal — content type is a hint.
    }

    return { data, contentType, sizeBytes: data.byteLength };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolveKey(key);
    await fs.rm(filePath, { force: true });
    await fs.rm(this.metaPath(filePath), { force: true });
  }
}
