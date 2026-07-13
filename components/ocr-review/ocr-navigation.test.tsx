import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OCRNavigation } from "./ocr-navigation";
import type { ReviewPage } from "./types";

function page(imageId: string, pageNumber: number, confirmed = false): ReviewPage {
  return {
    imageId,
    pageNumber,
    fileName: `${imageId}.png`,
    pageConfidence: 0.9,
    notes: null,
    unreadableRegions: [],
    entries: [],
    confirmed,
  };
}

describe("OCRNavigation", () => {
  it("disables prev on the first page and next on the last", () => {
    const onNavigate = vi.fn();
    render(
      <OCRNavigation
        pages={[page("a", 1), page("b", 2)]}
        currentIndex={0}
        canConfirmCurrent
        onNavigate={onNavigate}
        onConfirmCurrent={vi.fn()}
      />
    );
    expect(
      (screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it("jumps directly via page dots and marks confirmed pages", () => {
    const onNavigate = vi.fn();
    render(
      <OCRNavigation
        pages={[page("a", 1, true), page("b", 2)]}
        currentIndex={1}
        canConfirmCurrent={false}
        onNavigate={onNavigate}
        onConfirmCurrent={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Page 1 (confirmed)" }));
    expect(onNavigate).toHaveBeenCalledWith(0);
  });

  it("gates Confirm on full resolution and explains why", () => {
    const onConfirm = vi.fn();
    render(
      <OCRNavigation
        pages={[page("a", 1)]}
        currentIndex={0}
        canConfirmCurrent={false}
        onNavigate={vi.fn()}
        onConfirmCurrent={onConfirm}
      />
    );
    const confirm = screen.getByRole("button", { name: /Confirm page 1/ }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByText(/Resolve every field/)).toBeDefined();
  });

  it("confirms when allowed", () => {
    const onConfirm = vi.fn();
    render(
      <OCRNavigation
        pages={[page("a", 1)]}
        currentIndex={0}
        canConfirmCurrent
        onNavigate={vi.fn()}
        onConfirmCurrent={onConfirm}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Confirm page 1/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
