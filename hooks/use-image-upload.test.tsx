import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useImageUpload } from "./use-image-upload";

function makeFile(name: string, { type = "image/jpeg", size = 1024, lastModified = 1 } = {}): File {
  const file = new File(["x"], name, { type, lastModified });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("useImageUpload", () => {
  it("adds valid files in order with page-order state", () => {
    const { result } = renderHook(() => useImageUpload());
    act(() => result.current.addFiles([makeFile("one.jpg"), makeFile("two.jpg")]));

    expect(result.current.images.map((i) => i.fileName)).toEqual(["one.jpg", "two.jpg"]);
    expect(result.current.images.every((i) => i.rotation === 0 && i.previewable)).toBe(true);
    expect(result.current.rejections).toHaveLength(0);
  });

  it("records rejections for invalid files without dropping valid ones", () => {
    const { result } = renderHook(() => useImageUpload());
    act(() =>
      result.current.addFiles([
        makeFile("ok.jpg"),
        makeFile("nope.pdf", { type: "application/pdf" }),
      ])
    );

    expect(result.current.images).toHaveLength(1);
    expect(result.current.rejections).toHaveLength(1);
    expect(result.current.rejections[0]?.reason).toBe("unsupported-type");
  });

  it("removes an image by id", () => {
    const { result } = renderHook(() => useImageUpload());
    act(() => result.current.addFiles([makeFile("a.jpg"), makeFile("b.jpg", { lastModified: 2 })]));
    const id = result.current.images[0]!.id;

    act(() => result.current.removeImage(id));
    expect(result.current.images.map((i) => i.fileName)).toEqual(["b.jpg"]);
  });

  it("cycles rotation through 0 → 90 → 180 → 270 → 0", () => {
    const { result } = renderHook(() => useImageUpload());
    act(() => result.current.addFiles([makeFile("r.jpg")]));
    const id = result.current.images[0]!.id;

    const rotations: number[] = [];
    for (let i = 0; i < 4; i++) {
      act(() => result.current.rotateImage(id));
      rotations.push(result.current.images[0]!.rotation);
    }
    expect(rotations).toEqual([90, 180, 270, 0]);
  });

  it("moves images up and down and clamps at the edges", () => {
    const { result } = renderHook(() => useImageUpload());
    act(() =>
      result.current.addFiles([
        makeFile("a.jpg"),
        makeFile("b.jpg", { lastModified: 2 }),
        makeFile("c.jpg", { lastModified: 3 }),
      ])
    );
    const idOfB = result.current.images[1]!.id;

    act(() => result.current.moveImage(idOfB, -1));
    expect(result.current.images.map((i) => i.fileName)).toEqual(["b.jpg", "a.jpg", "c.jpg"]);

    // Already first — moving up again is a no-op.
    act(() => result.current.moveImage(idOfB, -1));
    expect(result.current.images.map((i) => i.fileName)).toEqual(["b.jpg", "a.jpg", "c.jpg"]);

    act(() => result.current.moveImage(idOfB, 1));
    expect(result.current.images.map((i) => i.fileName)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("clearAll empties the batch and the rejection list", () => {
    const { result } = renderHook(() => useImageUpload());
    act(() =>
      result.current.addFiles([makeFile("a.jpg"), makeFile("bad.txt", { type: "text/plain" })])
    );
    act(() => result.current.clearAll());

    expect(result.current.images).toHaveLength(0);
    expect(result.current.rejections).toHaveLength(0);
  });

  it("marks an image unpreviewable (HEIC fallback path)", () => {
    const { result } = renderHook(() => useImageUpload());
    act(() => result.current.addFiles([makeFile("scan.heic", { type: "image/heic" })]));
    const id = result.current.images[0]!.id;

    act(() => result.current.markUnpreviewable(id));
    expect(result.current.images[0]?.previewable).toBe(false);
  });

  it("dismisses individual rejections", () => {
    const { result } = renderHook(() => useImageUpload());
    act(() =>
      result.current.addFiles([
        makeFile("x.txt", { type: "text/plain" }),
        makeFile("y.txt", { type: "text/plain" }),
      ])
    );
    const first = result.current.rejections[0]!.id;

    act(() => result.current.dismissRejection(first));
    expect(result.current.rejections).toHaveLength(1);
  });
});
