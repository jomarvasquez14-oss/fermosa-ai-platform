// @vitest-environment node
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalStorageProvider } from "./local-storage-provider";

describe("LocalStorageProvider", () => {
  let root: string;
  let provider: LocalStorageProvider;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "fermosa-storage-test-"));
    provider = new LocalStorageProvider(root);
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("round-trips an object with its content type", async () => {
    const data = Buffer.from("logbook image bytes");
    await provider.put("submissions/sub1/img1", data, { contentType: "image/png" });

    const object = await provider.get("submissions/sub1/img1");
    expect(object).not.toBeNull();
    expect(object!.data.equals(data)).toBe(true);
    expect(object!.contentType).toBe("image/png");
    expect(object!.sizeBytes).toBe(data.byteLength);
  });

  it("returns null for a missing key", async () => {
    expect(await provider.get("submissions/none/missing")).toBeNull();
  });

  it("reports existence correctly", async () => {
    await provider.put("submissions/sub1/exists", Buffer.from("x"));
    expect(await provider.exists("submissions/sub1/exists")).toBe(true);
    expect(await provider.exists("submissions/sub1/nope")).toBe(false);
  });

  it("overwrites on repeated put (retry-safe)", async () => {
    await provider.put("submissions/sub1/retry", Buffer.from("first"));
    await provider.put("submissions/sub1/retry", Buffer.from("second attempt"));
    const object = await provider.get("submissions/sub1/retry");
    expect(object!.data.toString()).toBe("second attempt");
  });

  it("delete is idempotent", async () => {
    await provider.put("submissions/sub1/gone", Buffer.from("x"));
    await provider.delete("submissions/sub1/gone");
    expect(await provider.get("submissions/sub1/gone")).toBeNull();
    await expect(provider.delete("submissions/sub1/gone")).resolves.toBeUndefined();
  });

  it("rejects keys that escape the storage root", async () => {
    await expect(provider.put("../outside", Buffer.from("x"))).rejects.toThrow(/escapes/);
    await expect(provider.get("..\\..\\windows\\system32")).rejects.toThrow(/escapes/);
    await expect(provider.put("", Buffer.from("x"))).rejects.toThrow(/empty or malformed/);
  });

  it("get survives a missing metadata sidecar", async () => {
    await provider.put("submissions/sub1/nometa", Buffer.from("x"));
    const object = await provider.get("submissions/sub1/nometa");
    expect(object!.contentType).toBeUndefined();
  });
});
