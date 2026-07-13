import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageCard } from "./image-card";
import type { UploadImageItem } from "./types";

function makeImage(overrides: Partial<UploadImageItem> = {}): UploadImageItem {
  return {
    id: "img-1",
    file: new File(["x"], "page-1.jpg", { type: "image/jpeg" }),
    previewUrl: "blob:test-1",
    fileName: "page-1.jpg",
    sizeBytes: 2.5 * 1024 * 1024,
    rotation: 0,
    previewable: true,
    uploadState: "staged",
    ...overrides,
  };
}

function renderCard(props: Partial<React.ComponentProps<typeof ImageCard>> = {}) {
  const handlers = {
    onPreview: vi.fn(),
    onDelete: vi.fn(),
    onRotate: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onPreviewError: vi.fn(),
  };
  render(<ImageCard image={makeImage()} pageNumber={2} totalImages={3} {...handlers} {...props} />);
  return handlers;
}

describe("ImageCard", () => {
  it("shows file name, formatted size, and page number", () => {
    renderCard();
    expect(screen.getByText("page-1.jpg")).toBeDefined();
    expect(screen.getByText("2.5 MB")).toBeDefined();
    expect(screen.getByText("Page 2")).toBeDefined();
  });

  it("wires every action to its handler", () => {
    const handlers = renderCard();

    fireEvent.click(screen.getByRole("button", { name: /preview page-1\.jpg/i }));
    fireEvent.click(screen.getByRole("button", { name: /move page-1\.jpg up/i }));
    fireEvent.click(screen.getByRole("button", { name: /move page-1\.jpg down/i }));
    fireEvent.click(screen.getByRole("button", { name: /rotate page-1\.jpg/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove page-1\.jpg/i }));

    expect(handlers.onPreview).toHaveBeenCalledWith("img-1");
    expect(handlers.onMoveUp).toHaveBeenCalledWith("img-1");
    expect(handlers.onMoveDown).toHaveBeenCalledWith("img-1");
    expect(handlers.onRotate).toHaveBeenCalledWith("img-1");
    expect(handlers.onDelete).toHaveBeenCalledWith("img-1");
  });

  it("disables move-up on the first card and move-down on the last", () => {
    renderCard({ pageNumber: 1, totalImages: 1 });
    expect(
      screen.getByRole("button", { name: /move page-1\.jpg up/i }).hasAttribute("disabled")
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: /move page-1\.jpg down/i }).hasAttribute("disabled")
    ).toBe(true);
  });

  it("reports decode failures so HEIC can fall back", () => {
    const handlers = renderCard();
    fireEvent.error(screen.getByAltText(/logbook page 2/i));
    expect(handlers.onPreviewError).toHaveBeenCalledWith("img-1");
  });

  it("renders the no-preview fallback for unpreviewable images", () => {
    renderCard({ image: makeImage({ previewable: false }) });
    expect(screen.getByText(/preview not supported/i)).toBeDefined();
    expect(screen.queryByAltText(/logbook page/i)).toBeNull();
  });
});
