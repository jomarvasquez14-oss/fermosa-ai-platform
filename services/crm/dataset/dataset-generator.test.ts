// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { MockCRMConnector } from "@/services/crm/connectors/mock/mock-crm-connector";
import type { CRMConnector } from "@/services/crm/crm-connector";
import type { FindPatientsResult } from "@/services/crm/types";
import { generateDataset, metadataFor, splitRecord } from "./dataset-generator";

const connector = new MockCRMConnector();

function makeOutDir(): string {
  return mkdtempSync(path.join(tmpdir(), "crm-dataset-b-"));
}

describe("splitRecord", () => {
  it("splits a c-1001 record into the four on-disk sections, copied verbatim", async () => {
    const record = await connector.fetchPatientRecord("c-1001");
    const sections = splitRecord(record);

    expect(sections.patient).toEqual(record.patient);
    expect(sections.treatments).toEqual(record.treatments);
    expect(sections.invoice).toEqual(record.invoices);
    expect(sections.activityLog).toEqual(record.activity);
  });
});

describe("metadataFor", () => {
  it("sets snapshotHash (64-hex) and derives selectorVersion/crmVersion from sourceRef", async () => {
    const record = await connector.fetchPatientRecord("c-1001");
    const metadata = metadataFor(record, null, null);

    expect(metadata.crmPatientId).toBe("c-1001");
    expect(metadata.connectorKind).toBe("mock");
    expect(metadata.retrievedAt).toBe(record.retrievedAt);
    expect(metadata.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(metadata.selectorVersion).toBe("fixtures/v1");
    expect(metadata.crmVersion).toBe("fixtures/v1");
    expect(metadata.branch).toBeNull();
    expect(metadata.window).toBeNull();
  });

  it("carries branch/window through from the caller", async () => {
    const record = await connector.fetchPatientRecord("c-1001");
    const window = { from: "2026-01-01", to: "2026-12-31" };
    const metadata = metadataFor(record, "Fermosa Tejero", window);

    expect(metadata.branch).toBe("Fermosa Tejero");
    expect(metadata.window).toEqual(window);
  });
});

describe("generateDataset — idempotent + resumable", () => {
  it("skips already-retrieved patients on a second resumed run without corrupting files", async () => {
    const outDir = makeOutDir();
    try {
      const first = await generateDataset(
        { mode: "patient", crmId: "c-1001", outDir, resume: true },
        connector
      );
      expect(first.patients).toEqual(["c-1001"]);
      expect(first.warnings).toEqual([]);
      expect(first.failures).toEqual([]);

      const metadataFile = path.join(outDir, "crm", "c-1001", "metadata.json");
      expect(existsSync(metadataFile)).toBe(true);
      const firstMetadata = JSON.parse(readFileSync(metadataFile, "utf8"));

      const second = await generateDataset(
        { mode: "patient", crmId: "c-1001", outDir, resume: true },
        connector
      );
      expect(second.patients).toEqual(["c-1001"]);
      expect(second.warnings).toEqual(["skipped c-1001"]);
      expect(second.failures).toEqual([]);

      // Idempotent: the skipped run must not have touched the file.
      const secondMetadata = JSON.parse(readFileSync(metadataFile, "utf8"));
      expect(secondMetadata).toEqual(firstMetadata);

      const manifest = JSON.parse(readFileSync(path.join(outDir, "crm", "manifest.json"), "utf8"));
      expect(manifest.patients).toEqual(["c-1001"]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("generateDataset — failure isolation", () => {
  it("records a NOT_FOUND failure for an unknown id without aborting a batch that also includes c-1001", async () => {
    const outDir = makeOutDir();
    try {
      // A stub connector generalizes the "findPatients sweep" resolution path
      // (see resolvePatientIds) to a batch containing both a known-good id
      // and one the CRM rejects — proving the loop isolates failures instead
      // of special-casing the mock (which cannot itself return an unknown id
      // as a search candidate).
      const sweepConnector: CRMConnector = {
        kind: connector.kind,
        healthCheck: () => connector.healthCheck(),
        findPatients: (): Promise<FindPatientsResult> =>
          Promise.resolve({
            outcome: "ambiguous",
            candidates: [
              {
                crmId: "c-1001",
                fullName: "Santos, Maria",
                dateOfBirth: "1992-03-14",
                mobileNo: null,
                membershipType: "Regular",
                lastVisit: "2026-07-10",
              },
              {
                crmId: "c-9999",
                fullName: "Unknown, Patient",
                dateOfBirth: null,
                mobileNo: null,
                membershipType: null,
                lastVisit: null,
              },
            ],
          }),
        fetchPatientRecord: (crmId, window) => connector.fetchPatientRecord(crmId, window),
      };

      const manifest = await generateDataset({ mode: "all", outDir, resume: false }, sweepConnector);

      expect(manifest.failures).toEqual([
        { crmId: "c-9999", code: "NOT_FOUND", message: expect.any(String) },
      ]);
      expect(manifest.patients).toEqual(["c-1001"]);
      expect(existsSync(path.join(outDir, "crm", "c-1001", "metadata.json"))).toBe(true);
      expect(existsSync(path.join(outDir, "crm", "c-9999"))).toBe(false);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
