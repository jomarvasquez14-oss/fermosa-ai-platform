// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { MockCRMConnector } from "@/services/crm/connectors/mock/mock-crm-connector";
import type { CRMConnector } from "@/services/crm/crm-connector";
import type { NormalizedCrmPatientRecord, PatientPage } from "@/services/crm/types";
import {
  generateDataset,
  metadataFor,
  resolveDatasetRoot,
  splitRecord,
  verifyGeneratedDataset,
} from "./dataset-generator";
import { writePatientFiles } from "./dataset-writer";
import type { DatasetMetadata } from "./manifest";

const connector = new MockCRMConnector();

function makeOutDir(): string {
  return mkdtempSync(path.join(tmpdir(), "crm-dataset-b-"));
}

function readJson(...segments: string[]) {
  return JSON.parse(readFileSync(path.join(...segments), "utf8"));
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
  it("sets both hashes (64-hex) and derives selectorVersion/crmVersion from sourceRef", async () => {
    const record = await connector.fetchPatientRecord("c-1001");
    const metadata = metadataFor(record, null, null);
    expect(metadata.crmPatientId).toBe("c-1001");
    expect(metadata.connectorKind).toBe("mock");
    expect(metadata.retrievedAt).toBe(record.retrievedAt);
    expect(metadata.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(metadata.evidenceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(metadata.selectorVersion).toBe("fixtures/v1");
    expect(metadata.crmVersion).toBe("fixtures/v1");
    expect(metadata.branch).toBeNull();
    expect(metadata.window).toBeNull();
  });

  it("carries a genuinely-applied branch/window through from the caller", async () => {
    const record = await connector.fetchPatientRecord("c-1001");
    const window = { from: "2026-01-01", to: "2026-12-31" };
    const metadata = metadataFor(record, "Fermosa Tejero", window);
    expect(metadata.branch).toBe("Fermosa Tejero");
    expect(metadata.window).toEqual(window);
  });
});

describe("resolveDatasetRoot", () => {
  it("scopes the root by mode (ADR-037 layout)", () => {
    expect(resolveDatasetRoot({ mode: "patient", outDir: "d", resume: false })).toBe(
      path.join("d", "crm", "patient")
    );
    expect(resolveDatasetRoot({ mode: "all", outDir: "d", resume: false })).toBe(
      path.join("d", "crm", "all")
    );
    expect(
      resolveDatasetRoot({ mode: "branch", branch: "Fermosa Imus", outDir: "d", resume: false })
    ).toBe(path.join("d", "crm", "branch", "fermosa-imus"));
    expect(
      resolveDatasetRoot({
        mode: "dateRange",
        window: { from: "2026-01-01", to: "2026-06-30" },
        outDir: "d",
        resume: false,
      })
    ).toBe(path.join("d", "crm", "date", "2026-01-01_2026-06-30"));
  });
});

describe("MockCRMConnector.listPatients", () => {
  it("enumerates the fixtures a fixed page at a time", async () => {
    const p1 = await connector.listPatients(1);
    expect(p1.page).toBe(1);
    expect(p1.patients).toHaveLength(3);
    expect(p1.hasNextPage).toBe(true);
    const p3 = await connector.listPatients(3);
    expect(p3.hasNextPage).toBe(false);
    const past = await connector.listPatients(99);
    expect(past.patients).toEqual([]);
    expect(past.hasNextPage).toBe(false);
  });
});

describe("generateDataset — patient mode (single + multiple ids)", () => {
  it("writes all six files under crm/patient/<id> and a manifest summary", async () => {
    const outDir = makeOutDir();
    try {
      const manifest = await generateDataset(
        { mode: "patient", crmIds: ["c-1001", "c-1002"], outDir, resume: false },
        connector
      );
      const root = path.join(outDir, "crm", "patient");
      for (const id of ["c-1001", "c-1002"]) {
        for (const file of [
          "patient.json",
          "treatments.json",
          "invoice.json",
          "activity-log.json",
          "snapshot.json",
          "metadata.json",
        ]) {
          expect(existsSync(path.join(root, id, file))).toBe(true);
        }
      }
      expect(manifest.mode).toBe("patient");
      expect(manifest.patients).toEqual(["c-1001", "c-1002"]);
      expect(manifest.enumeratedCount).toBe(2);
      expect(manifest.pageCount).toBe(0);
      expect(manifest.summary.included).toBe(2);
      expect(manifest.summary.totalBytes).toBeGreaterThan(0);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("throws when no crmId is given", async () => {
    const outDir = makeOutDir();
    try {
      await expect(
        generateDataset({ mode: "patient", crmIds: [], outDir, resume: false }, connector)
      ).rejects.toThrow(/requires at least one crmId/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("generateDataset — snapshot.json reproducibility seal", () => {
  it("carries the record + both hashes, matching metadata.json", async () => {
    const outDir = makeOutDir();
    try {
      await generateDataset(
        { mode: "patient", crmIds: ["c-1001"], outDir, resume: false },
        connector
      );
      const root = path.join(outDir, "crm", "patient");
      const snapshot = readJson(root, "c-1001", "snapshot.json");
      const metadata = readJson(root, "c-1001", "metadata.json");
      expect(snapshot.snapshotVersion).toBe(1);
      expect(snapshot.contentHash).toBe(metadata.snapshotHash);
      expect(snapshot.evidenceHash).toBe(metadata.evidenceHash);
      expect(snapshot.record.patient.crmId).toBe("c-1001");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("generateDataset — all mode enumerates the whole clinic", () => {
  it("sweeps every fixture across pages and records enumeration provenance", async () => {
    const outDir = makeOutDir();
    try {
      const manifest = await generateDataset({ mode: "all", outDir, resume: false }, connector);
      expect(manifest.patients).toHaveLength(9);
      expect(manifest.enumeratedCount).toBe(9);
      expect(manifest.pageCount).toBe(3);
      expect(manifest.skipped).toEqual([]);
      expect(existsSync(path.join(outDir, "crm", "all", "c-1009", "metadata.json"))).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("generateDataset — branch mode derives membership from records (ADR-037)", () => {
  it("keeps only Fermosa Tejero patients and stamps the genuinely-applied branch", async () => {
    const outDir = makeOutDir();
    try {
      const manifest = await generateDataset(
        { mode: "branch", branch: "Fermosa Tejero", outDir, resume: false },
        connector
      );
      // Fixtures: c-1001, c-1004, c-1009 have a Tejero treatment.
      expect(manifest.patients.sort()).toEqual(["c-1001", "c-1004", "c-1009"]);
      expect(manifest.skipped).toContain("c-1002"); // Imus — filtered out
      expect(manifest.branch).toBe("Fermosa Tejero");

      const root = path.join(outDir, "crm", "branch", "fermosa-tejero");
      const metadata = readJson(root, "c-1001", "metadata.json");
      // Branch IS applied here (derived from the record) — so it IS stamped.
      expect(metadata.branch).toBe("Fermosa Tejero");
      expect(existsSync(path.join(root, "c-1002"))).toBe(false);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("never stamps a branch that was not applied (patient/all modes)", async () => {
    const outDir = makeOutDir();
    try {
      await generateDataset({ mode: "all", outDir, resume: false }, connector);
      const metadata = readJson(outDir, "crm", "all", "c-1001", "metadata.json");
      expect(metadata.branch).toBeNull();
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("throws when branch mode has no --branch", async () => {
    const outDir = makeOutDir();
    try {
      await expect(
        generateDataset({ mode: "branch", outDir, resume: false }, connector)
      ).rejects.toThrow(/requires --branch/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("generateDataset — dateRange mode keeps only in-window content", () => {
  it("windows retrieval and skips patients with no in-window data", async () => {
    const outDir = makeOutDir();
    try {
      const window = { from: "2000-01-01", to: "2100-12-31" };
      const manifest = await generateDataset(
        { mode: "dateRange", window, outDir, resume: false },
        connector
      );
      // c-1005 has no treatments/invoices/activity at all → always skipped.
      expect(manifest.skipped).toContain("c-1005");
      expect(manifest.patients).not.toContain("c-1005");
      const root = path.join(outDir, "crm", "date", "2000-01-01_2100-12-31");
      const metadata = readJson(root, manifest.patients[0]!, "metadata.json");
      expect(metadata.window).toEqual(window);
      expect(metadata.branch).toBeNull();
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("a far-past window skips everyone (no in-window content)", async () => {
    const outDir = makeOutDir();
    try {
      const window = { from: "1900-01-01", to: "1900-12-31" };
      const manifest = await generateDataset(
        { mode: "dateRange", window, outDir, resume: false },
        connector
      );
      expect(manifest.patients).toEqual([]);
      expect(manifest.skipped).toHaveLength(9);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("generateDataset — sweep needs an enumerable connector", () => {
  it("fails loudly when the connector cannot listPatients", async () => {
    const outDir = makeOutDir();
    try {
      const noEnum: CRMConnector = {
        kind: "api",
        healthCheck: () => connector.healthCheck(),
        findPatients: () => Promise.resolve({ outcome: "not-found", candidates: [] }),
        fetchPatientRecord: (id, w) => connector.fetchPatientRecord(id, w),
      };
      await expect(
        generateDataset({ mode: "all", outDir, resume: false }, noEnum)
      ).rejects.toThrow(/does not support patient enumeration/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("generateDataset — idempotent + resumable", () => {
  it("skips already-retrieved patients on a second resumed run without corrupting files", async () => {
    const outDir = makeOutDir();
    try {
      const first = await generateDataset(
        { mode: "patient", crmIds: ["c-1001"], outDir, resume: true },
        connector
      );
      expect(first.patients).toEqual(["c-1001"]);
      expect(first.warnings).toEqual([]);

      const metadataFile = path.join(outDir, "crm", "patient", "c-1001", "metadata.json");
      const firstMetadata = readJson(metadataFile);

      const second = await generateDataset(
        { mode: "patient", crmIds: ["c-1001"], outDir, resume: true },
        connector
      );
      expect(second.patients).toEqual(["c-1001"]);
      expect(second.warnings).toEqual(["skipped c-1001 (resume)"]);
      expect(readJson(metadataFile)).toEqual(firstMetadata);
      // Provenance survives a fully-resumed run.
      expect(second.connectorKind).toBe("mock");
      expect(second.selectorVersion).toBe("fixtures/v1");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("generateDataset — failure isolation", () => {
  function stubWith(fetch: CRMConnector["fetchPatientRecord"], ids: string[]): CRMConnector {
    return {
      kind: connector.kind,
      healthCheck: () => connector.healthCheck(),
      findPatients: () => Promise.resolve({ outcome: "not-found", candidates: [] }),
      fetchPatientRecord: fetch,
      listPatients: (page: number): Promise<PatientPage> =>
        Promise.resolve({
          page,
          patients:
            page === 1
              ? ids.map((crmId) => ({
                  crmId,
                  fullName: crmId,
                  dateOfBirth: null,
                  mobileNo: null,
                  membershipType: null,
                  lastVisit: null,
                }))
              : [],
          hasNextPage: false,
        }),
    };
  }

  it("records a NOT_FOUND failure for an unknown id without aborting the batch", async () => {
    const outDir = makeOutDir();
    try {
      const stub = stubWith(
        (crmId, window) => connector.fetchPatientRecord(crmId, window),
        ["c-1001", "c-9999"]
      );
      const manifest = await generateDataset({ mode: "all", outDir, resume: false }, stub);
      expect(manifest.failures).toEqual([
        { crmId: "c-9999", code: "NOT_FOUND", message: expect.any(String) },
      ]);
      expect(manifest.patients).toEqual(["c-1001"]);
      expect(existsSync(path.join(outDir, "crm", "all", "c-9999"))).toBe(false);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("records a plain (non-AppError) failure without aborting the batch", async () => {
    const outDir = makeOutDir();
    try {
      const stub = stubWith((crmId, window) => {
        if (crmId === "c-broken") throw new Error("disk full");
        return connector.fetchPatientRecord(crmId, window);
      }, ["c-1001", "c-broken"]);
      const manifest = await generateDataset({ mode: "all", outDir, resume: false }, stub);
      expect(manifest.failures).toEqual([{ crmId: "c-broken", code: "ERROR", message: "disk full" }]);
      expect(manifest.patients).toEqual(["c-1001"]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("generateDataset — duplicate detection", () => {
  it("flags identical record content found under two crmIds", async () => {
    const outDir = makeOutDir();
    try {
      const shared = await connector.fetchPatientRecord("c-1001");
      const stub: CRMConnector = {
        kind: connector.kind,
        healthCheck: () => connector.healthCheck(),
        findPatients: () => Promise.resolve({ outcome: "not-found", candidates: [] }),
        // Same record content for two different ids → identical contentHash.
        fetchPatientRecord: (): Promise<NormalizedCrmPatientRecord> =>
          Promise.resolve(structuredClone(shared)),
        listPatients: (page: number): Promise<PatientPage> =>
          Promise.resolve({
            page,
            patients:
              page === 1
                ? ["dup-a", "dup-b"].map((crmId) => ({
                    crmId,
                    fullName: crmId,
                    dateOfBirth: null,
                    mobileNo: null,
                    membershipType: null,
                    lastVisit: null,
                  }))
                : [],
            hasNextPage: false,
          }),
      };
      const manifest = await generateDataset({ mode: "all", outDir, resume: false }, stub);
      expect(manifest.duplicates).toHaveLength(1);
      expect(manifest.duplicates[0]!.crmIds.sort()).toEqual(["dup-a", "dup-b"]);
      expect(manifest.warnings.some((w) => /duplicate record/.test(w))).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("verifyGeneratedDataset — hash verification", () => {
  it("passes for an untampered dataset and catches a byte-level tamper", async () => {
    const outDir = makeOutDir();
    try {
      await generateDataset(
        { mode: "patient", crmIds: ["c-1001", "c-1002"], outDir, resume: false },
        connector
      );
      const opts = { mode: "patient" as const, outDir, resume: false };
      const clean = verifyGeneratedDataset(opts);
      expect(clean.checked).toBe(2);
      expect(clean.ok).toBe(2);
      expect(clean.issues).toEqual([]);

      // Tamper with one record inside snapshot.json.
      const snapPath = path.join(outDir, "crm", "patient", "c-1001", "snapshot.json");
      const snapshot = readJson(snapPath);
      snapshot.record.patient.fullName = "TAMPERED";
      writeFileSync(snapPath, JSON.stringify(snapshot, null, 2), "utf8");

      const tampered = verifyGeneratedDataset(opts);
      expect(tampered.ok).toBe(1);
      expect(tampered.issues.some((i) => i.crmId === "c-1001" && i.kind === "content-hash")).toBe(
        true
      );
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("writePatientFiles — unsafe crmId", () => {
  const record = {} as NormalizedCrmPatientRecord;
  function metadata(crmPatientId: string): DatasetMetadata {
    return {
      crmPatientId,
      connectorKind: "mock",
      selectorVersion: "fixtures/v1",
      retrievedAt: new Date().toISOString(),
      snapshotHash: "a".repeat(64),
      evidenceHash: "b".repeat(64),
      crmVersion: "fixtures/v1",
      branch: null,
      window: null,
    };
  }

  it("throws for a crmId containing '..'", () => {
    const outDir = makeOutDir();
    try {
      expect(() =>
        writePatientFiles(
          outDir,
          "../escape",
          { patient: {}, treatments: [], invoice: [], activityLog: [] },
          metadata("../escape"),
          record
        )
      ).toThrow(/unsafe crmId/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("throws for a crmId containing a path separator", () => {
    const outDir = makeOutDir();
    try {
      expect(() =>
        writePatientFiles(
          outDir,
          "c-1001/evil",
          { patient: {}, treatments: [], invoice: [], activityLog: [] },
          metadata("c-1001/evil"),
          record
        )
      ).toThrow(/unsafe crmId/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
