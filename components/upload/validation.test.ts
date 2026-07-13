import { describe, expect, it } from "vitest";
import type { UploadImageItem } from "./types";
import {
  fileIdentity,
  isAcceptedImageType,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGES,
  validateFiles,
} from "./validation";

function makeFile(
  name: string,
  { type = "image/jpeg", size = 1024, lastModified = 1700000000000 } = {}
): File {
  const file = new File(["x"], name, { type, lastModified });
  // File size is derived from contents; override for large-file cases.
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function makeItem(file: File): UploadImageItem {
  return {
    id: file.name,
    file,
    previewUrl: `blob:${file.name}`,
    fileName: file.name,
    sizeBytes: file.size,
    rotation: 0,
    previewable: true,
    uploadState: "staged",
  };
}

describe("isAcceptedImageType", () => {
  it("accepts jpeg, png, and heic mime types", () => {
    expect(isAcceptedImageType(makeFile("a.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(isAcceptedImageType(makeFile("a.png", { type: "image/png" }))).toBe(true);
    expect(isAcceptedImageType(makeFile("a.heic", { type: "image/heic" }))).toBe(true);
  });

  it("falls back to the extension when the mime type is missing", () => {
    expect(isAcceptedImageType(makeFile("photo.HEIC", { type: "" }))).toBe(true);
    expect(isAcceptedImageType(makeFile("photo.jpeg", { type: "application/octet-stream" }))).toBe(
      true
    );
  });

  it("rejects non-image files", () => {
    expect(isAcceptedImageType(makeFile("doc.pdf", { type: "application/pdf" }))).toBe(false);
    expect(isAcceptedImageType(makeFile("clip.gif", { type: "image/gif" }))).toBe(false);
    expect(isAcceptedImageType(makeFile("archive.zip", { type: "" }))).toBe(false);
  });
});

describe("validateFiles", () => {
  it("accepts valid files and reports none rejected", () => {
    const result = validateFiles([makeFile("a.jpg"), makeFile("b.png", { type: "image/png" })], []);
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
  });

  it("rejects invalid files individually, never the whole selection", () => {
    const result = validateFiles(
      [
        makeFile("good.jpg"),
        makeFile("bad.pdf", { type: "application/pdf" }),
        makeFile("huge.jpg", { size: MAX_FILE_SIZE_BYTES + 1 }),
        makeFile("also-good.png", { type: "image/png" }),
      ],
      []
    );
    expect(result.accepted.map((f) => f.name)).toEqual(["good.jpg", "also-good.png"]);
    expect(result.rejected.map((r) => r.reason)).toEqual(["unsupported-type", "too-large"]);
  });

  it("accepts a file exactly at the 10 MB limit", () => {
    const result = validateFiles([makeFile("edge.jpg", { size: MAX_FILE_SIZE_BYTES })], []);
    expect(result.accepted).toHaveLength(1);
  });

  it("rejects duplicates already in the batch", () => {
    const existing = makeItem(makeFile("dup.jpg"));
    const result = validateFiles([makeFile("dup.jpg")], [existing]);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe("duplicate");
  });

  it("rejects duplicates within the same selection", () => {
    const result = validateFiles([makeFile("twice.jpg"), makeFile("twice.jpg")], []);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe("duplicate");
  });

  it("treats same-name files with different sizes as distinct", () => {
    const result = validateFiles(
      [makeFile("page.jpg", { size: 100 }), makeFile("page.jpg", { size: 200 })],
      []
    );
    expect(result.accepted).toHaveLength(2);
  });

  it("enforces the 20-image batch limit across existing and new files", () => {
    const existing = Array.from({ length: MAX_IMAGES - 1 }, (_, i) =>
      makeItem(makeFile(`existing-${i}.jpg`))
    );
    const result = validateFiles([makeFile("fits.jpg"), makeFile("overflow.jpg")], existing);
    expect(result.accepted.map((f) => f.name)).toEqual(["fits.jpg"]);
    expect(result.rejected[0]?.reason).toBe("limit-reached");
  });

  it("still validates type before counting toward the limit", () => {
    const existing = Array.from({ length: MAX_IMAGES }, (_, i) =>
      makeItem(makeFile(`existing-${i}.jpg`))
    );
    const result = validateFiles([makeFile("bad.txt", { type: "text/plain" })], existing);
    expect(result.rejected[0]?.reason).toBe("unsupported-type");
  });
});

describe("fileIdentity", () => {
  it("differs when any of name, size, or lastModified differ", () => {
    const base = makeFile("a.jpg", { size: 10, lastModified: 1 });
    expect(fileIdentity(base)).not.toBe(
      fileIdentity(makeFile("b.jpg", { size: 10, lastModified: 1 }))
    );
    expect(fileIdentity(base)).not.toBe(
      fileIdentity(makeFile("a.jpg", { size: 11, lastModified: 1 }))
    );
    expect(fileIdentity(base)).not.toBe(
      fileIdentity(makeFile("a.jpg", { size: 10, lastModified: 2 }))
    );
  });
});
