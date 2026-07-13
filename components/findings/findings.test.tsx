import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FindingCard } from "./finding-card";
import { rollupFindings, sortFindings } from "./findings-summary";
import { canTransition, findingEvidenceSchema, nextStatuses, type FindingView } from "./types";

function makeFinding(overrides: Partial<FindingView> = {}): FindingView {
  return {
    id: "f-test",
    category: "MISMATCHED_FIELD",
    severity: "MEDIUM",
    status: "OPEN",
    source: "RULE_ENGINE",
    submissionId: "sub-1",
    branchName: "Fermosa Tejero",
    auditDate: "2026-07-10",
    title: "Therapist differs between logbook and CRM",
    detail: "Logbook says K. Ramos, CRM says M. Lim.",
    recommendation: "Confirm with the branch.",
    expectedValue: "M. Lim",
    actualValue: "K. Ramos",
    evidence: [
      { type: "logbook-field", imageId: "img-1", pageNumber: 1, lineNumber: 2, field: "therapist" },
    ],
    confidence: 0.88,
    createdAt: "2026-07-13T09:00:00Z",
    ...overrides,
  };
}

describe("status workflow", () => {
  it("allows only the documented transitions (§5.5)", () => {
    expect(canTransition("OPEN", "REVIEWED")).toBe(true);
    expect(canTransition("REVIEWED", "RESOLVED")).toBe(true);
    expect(canTransition("REVIEWED", "OPEN")).toBe(true);
    expect(canTransition("RESOLVED", "OPEN")).toBe(true);
    // Resolution always passes through review; nothing self-transitions.
    expect(canTransition("OPEN", "RESOLVED")).toBe(false);
    expect(canTransition("RESOLVED", "REVIEWED")).toBe(false);
    expect(canTransition("OPEN", "OPEN")).toBe(false);
  });

  it("nextStatuses drives the action buttons", () => {
    expect(nextStatuses("OPEN")).toEqual(["REVIEWED"]);
    expect(nextStatuses("REVIEWED")).toEqual(["RESOLVED", "OPEN"]);
    expect(nextStatuses("RESOLVED")).toEqual(["OPEN"]);
  });
});

describe("evidence schema", () => {
  it("accepts every documented evidence type", () => {
    const finding = makeFinding();
    for (const item of finding.evidence) {
      expect(() => findingEvidenceSchema.parse(item)).not.toThrow();
    }
    expect(() =>
      findingEvidenceSchema.parse({
        type: "crm-record",
        crmPatientId: "c-1",
        refNo: null,
        description: "x",
      })
    ).not.toThrow();
    expect(() => findingEvidenceSchema.parse({ type: "screenshot", url: "x" })).toThrow();
  });
});

describe("rollup and sorting", () => {
  const findings = [
    makeFinding({
      id: "a",
      severity: "LOW",
      status: "RESOLVED",
      createdAt: "2026-07-13T01:00:00Z",
    }),
    makeFinding({
      id: "b",
      severity: "CRITICAL",
      status: "OPEN",
      createdAt: "2026-07-13T02:00:00Z",
    }),
    makeFinding({
      id: "c",
      severity: "HIGH",
      status: "REVIEWED",
      createdAt: "2026-07-13T03:00:00Z",
    }),
    makeFinding({
      id: "d",
      severity: "CRITICAL",
      status: "OPEN",
      createdAt: "2026-07-13T04:00:00Z",
    }),
  ];

  it("rolls up totals by status and severity in one pass", () => {
    expect(rollupFindings(findings)).toEqual({
      total: 4,
      open: 2,
      reviewed: 1,
      resolved: 1,
      critical: 2,
      high: 1,
    });
  });

  it("sorts most-severe first, newest first within a severity", () => {
    expect(sortFindings(findings).map((finding) => finding.id)).toEqual(["d", "b", "c", "a"]);
  });
});

describe("FindingCard", () => {
  function renderCard(finding = makeFinding(), expanded = true) {
    const handlers = { onToggle: vi.fn(), onStatusChange: vi.fn() };
    render(<FindingCard finding={finding} expanded={expanded} {...handlers} />);
    return handlers;
  }

  it("shows title, severity, category, and status when collapsed", () => {
    renderCard(makeFinding(), false);
    expect(screen.getByText("Therapist differs between logbook and CRM")).toBeDefined();
    expect(screen.getByText("MEDIUM")).toBeDefined();
    expect(screen.getByText("Mismatched field")).toBeDefined();
    expect(screen.getByText("open")).toBeDefined();
  });

  it("expanded view exposes detail, expected/actual, evidence, and recommendation", () => {
    renderCard();
    expect(screen.getByText(/Logbook says K. Ramos/)).toBeDefined();
    expect(screen.getByText("M. Lim")).toBeDefined();
    expect(screen.getByText("K. Ramos")).toBeDefined();
    expect(screen.getByText(/Logbook page 1, line 2/)).toBeDefined();
    expect(screen.getByText("Confirm with the branch.")).toBeDefined();
  });

  it("offers only legal transitions and emits them", () => {
    const handlers = renderCard();
    // OPEN → only "Mark reviewed" (never a direct Resolve).
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
    expect(handlers.onStatusChange).toHaveBeenCalledWith("f-test", "REVIEWED");
  });

  it("toggle button is accessible and reports expansion state", () => {
    const handlers = renderCard(makeFinding(), false);
    const toggle = screen.getByRole("button", { name: /Expand finding:/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(handlers.onToggle).toHaveBeenCalledWith("f-test");
  });
});
