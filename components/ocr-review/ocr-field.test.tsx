import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { bandFor } from "./confidence";
import { OCRField } from "./ocr-field";
import type { ReviewField } from "./types";

function makeField(overrides: Partial<ReviewField> = {}): ReviewField {
  return {
    key: "patientName",
    originalValue: "Maria Santos",
    value: "Maria Santos",
    confidence: 0.85,
    modelUnreadable: false,
    status: "pending",
    ...overrides,
  };
}

function renderField(field = makeField(), disabled = false) {
  const handlers = {
    onAccept: vi.fn(),
    onEdit: vi.fn(),
    onMarkUnreadable: vi.fn(),
    onReset: vi.fn(),
  };
  render(<OCRField field={field} disabled={disabled} {...handlers} />);
  return handlers;
}

describe("confidence bands", () => {
  it("maps thresholds per OCR_ARCHITECTURE §5", () => {
    expect(bandFor(0.95)).toBe("auto");
    expect(bandFor(0.94)).toBe("review");
    expect(bandFor(0.8)).toBe("review");
    expect(bandFor(0.79)).toBe("manual");
  });
});

describe("OCRField", () => {
  it("shows value, confidence, and accessible verdict controls", () => {
    renderField();
    expect(screen.getByText("Maria Santos")).toBeDefined();
    expect(screen.getByLabelText("Confidence 0.85")).toBeDefined();
    expect(screen.getByRole("button", { name: "Accept Patient" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Edit Patient" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Mark Patient unreadable" })).toBeDefined();
  });

  it("accepts on Accept", () => {
    const handlers = renderField();
    fireEvent.click(screen.getByRole("button", { name: "Accept Patient" }));
    expect(handlers.onAccept).toHaveBeenCalledTimes(1);
  });

  it("edits through the inline input and submits on Enter", () => {
    const handlers = renderField();
    fireEvent.click(screen.getByRole("button", { name: "Edit Patient" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Maria Santos-Reyes" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(handlers.onEdit).toHaveBeenCalledWith("Maria Santos-Reyes");
  });

  it("never submits an empty correction", () => {
    const handlers = renderField();
    fireEvent.click(screen.getByRole("button", { name: "Edit Patient" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(handlers.onEdit).not.toHaveBeenCalled();
  });

  it("marks unreadable and shows the confirmed-unreadable state", () => {
    const handlers = renderField();
    fireEvent.click(screen.getByRole("button", { name: "Mark Patient unreadable" }));
    expect(handlers.onMarkUnreadable).toHaveBeenCalledTimes(1);

    render(
      <OCRField
        field={makeField({ status: "unreadable", value: null })}
        onAccept={vi.fn()}
        onEdit={vi.fn()}
        onMarkUnreadable={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByText("Unreadable (confirmed)")).toBeDefined();
  });

  it("disables Accept when OCR read nothing (edit or unreadable are the only paths)", () => {
    renderField(
      makeField({ value: null, originalValue: null, confidence: 0, modelUnreadable: true })
    );
    expect(
      (screen.getByRole("button", { name: "Accept Patient" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("shows the crossed-out OCR value after an edit and offers Undo", () => {
    const handlers = renderField(
      makeField({ status: "edited", value: "Maria Reyes", originalValue: "Maria Santos" })
    );
    expect(screen.getByText("Maria Santos")).toBeDefined(); // strikethrough original
    fireEvent.click(screen.getByRole("button", { name: "Undo decision on Patient" }));
    expect(handlers.onReset).toHaveBeenCalledTimes(1);
  });

  it("highlights by band via data/status classes", () => {
    const { container } = render(
      <OCRField
        field={makeField({ confidence: 0.5 })}
        onAccept={vi.fn()}
        onEdit={vi.fn()}
        onMarkUnreadable={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(container.firstElementChild?.getAttribute("data-status")).toBe("pending");
    expect(container.firstElementChild?.className).toContain("border-destructive");
  });
});
