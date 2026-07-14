// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { MockCRMConnector } from "@/services/crm/connectors/mock/mock-crm-connector";
import type { CRMConnector } from "@/services/crm/crm-connector";
import type { NormalizedCrmPatientRecord, PatientPage } from "@/services/crm/types";
import { buildAuditPackage, packageRootFor } from "./package-builder";
import { verifyAuditPackage } from "./package-verifier";

const connector = new MockCRMConnector();

function makeOutDir(): string {
  return mkdtempSync(path.join(tmpdir(), "audit-pkg-"));
}
function readJson(...segments: string[]) {
  return JSON.parse(readFileSync(path.join(...segments), "utf8"));
}

describe("buildAuditPackage — explicit patient ids", () => {
  it("writes per-patient evidence, a manifest, metadata, and a passing verification report", async () => {
    const outDir = makeOutDir();
    try {
      const result = await buildAuditPackage(
        { branch: "Fermosa Imus", auditDate: "2026-07-14", crmIds: ["c-1002", "c-1007"], outDir },
        connector
      );
      const root = path.join(outDir, "fermosa-imus", "2026-07-14");
      expect(result.packageRoot).toBe(root);

      for (const id of ["c-1002", "c-1007"]) {
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
      expect(existsSync(path.join(root, "manifest.json"))).toBe(true);
      expect(existsSync(path.join(root, "audit-metadata.json"))).toBe(true);
      expect(existsSync(path.join(root, "verification-report.json"))).toBe(true);

      expect(result.manifest.patients.map((p) => p.crmId).sort()).toEqual(["c-1002", "c-1007"]);
      expect(result.manifest.packageHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.verification.ok).toBe(true);
      expect(result.metadata.requestedCrmIds).toEqual(["c-1002", "c-1007"]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("throws when neither ids nor a window are given", async () => {
    const outDir = makeOutDir();
    try {
      await expect(
        buildAuditPackage({ branch: "X", outDir }, connector)
      ).rejects.toThrow(/provide crmIds or a window/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("buildAuditPackage — reproducibility", () => {
  it("produces an identical packageHash on a second run (evidence hash excludes retrievedAt)", async () => {
    const outDirA = makeOutDir();
    const outDirB = makeOutDir();
    try {
      const a = await buildAuditPackage(
        { branch: "B", auditDate: "2026-07-14", crmIds: ["c-1001", "c-1009"], outDir: outDirA },
        connector
      );
      const b = await buildAuditPackage(
        { branch: "B", auditDate: "2026-07-14", crmIds: ["c-1001", "c-1009"], outDir: outDirB },
        connector
      );
      expect(a.manifest.packageHash).toBe(b.manifest.packageHash);
      // Business file hashes are byte-reproducible too.
      const aTreat = a.manifest.patients.find((p) => p.crmId === "c-1001")!;
      const bTreat = b.manifest.patients.find((p) => p.crmId === "c-1001")!;
      expect(aTreat.evidenceHash).toBe(bTreat.evidenceHash);
      expect(aTreat.files).toEqual(bTreat.files);
    } finally {
      rmSync(outDirA, { recursive: true, force: true });
      rmSync(outDirB, { recursive: true, force: true });
    }
  });
});

describe("verifyAuditPackage — tamper detection", () => {
  it("passes clean, then catches a mutated business file", async () => {
    const outDir = makeOutDir();
    try {
      const result = await buildAuditPackage(
        { branch: "B", auditDate: "2026-07-14", crmIds: ["c-1001"], outDir },
        connector
      );
      expect(verifyAuditPackage(result.packageRoot).ok).toBe(true);

      // Tamper with a business file — its SHA-256 no longer matches the manifest.
      const patientFile = path.join(result.packageRoot, "c-1001", "patient.json");
      const mutated = JSON.parse(readFileSync(patientFile, "utf8"));
      mutated.fullName = "TAMPERED";
      writeFileSync(patientFile, `${JSON.stringify(mutated, null, 2)}\n`, "utf8");

      const report = verifyAuditPackage(result.packageRoot);
      expect(report.ok).toBe(false);
      const patient = report.patients.find((p) => p.crmId === "c-1001")!;
      expect(patient.ok).toBe(false);
      expect(patient.issues.some((i) => /sha256 mismatch/.test(i))).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("catches a doctored manifest packageHash", async () => {
    const outDir = makeOutDir();
    try {
      const result = await buildAuditPackage(
        { branch: "B", auditDate: "2026-07-14", crmIds: ["c-1001"], outDir },
        connector
      );
      const manifestPath = path.join(result.packageRoot, "manifest.json");
      const manifest = readJson(manifestPath);
      manifest.packageHash = "0".repeat(64);
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      const report = verifyAuditPackage(result.packageRoot);
      expect(report.ok).toBe(false);
      expect(report.recomputedPackageHash).not.toBe(report.packageHash);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("buildAuditPackage — date-range sweep", () => {
  function sweepConnector(): CRMConnector {
    return {
      kind: connector.kind,
      healthCheck: () => connector.healthCheck(),
      findPatients: () => Promise.resolve({ outcome: "not-found", candidates: [] }),
      fetchPatientRecord: (id, w) => connector.fetchPatientRecord(id, w),
      listPatients: (page: number): Promise<PatientPage> =>
        connector.listPatients(page),
    };
  }

  it("enumerates, windows retrieval, and skips patients with no in-window content", async () => {
    const outDir = makeOutDir();
    try {
      const result = await buildAuditPackage(
        {
          branch: "All",
          auditDate: "2026-07-14",
          window: { from: "2000-01-01", to: "2100-12-31" },
          outDir,
        },
        sweepConnector()
      );
      // c-1005 has no content at all → skipped, never written.
      expect(result.metadata.skipped).toContain("c-1005");
      expect(result.manifest.patients.map((p) => p.crmId)).not.toContain("c-1005");
      expect(result.metadata.requestedCrmIds).toBeNull();
      expect(result.verification.ok).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("fails loudly on a window sweep when the connector cannot enumerate", async () => {
    const outDir = makeOutDir();
    try {
      const noEnum: CRMConnector = {
        kind: "api",
        healthCheck: () => connector.healthCheck(),
        findPatients: () => Promise.resolve({ outcome: "not-found", candidates: [] }),
        fetchPatientRecord: (id, w) => connector.fetchPatientRecord(id, w),
      };
      await expect(
        buildAuditPackage(
          { branch: "X", window: { from: "2026-01-01", to: "2026-12-31" }, outDir },
          noEnum
        )
      ).rejects.toThrow(/cannot enumerate patients/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("buildAuditPackage — failure isolation", () => {
  it("records a per-patient failure without aborting the package", async () => {
    const outDir = makeOutDir();
    try {
      const stub: CRMConnector = {
        kind: connector.kind,
        healthCheck: () => connector.healthCheck(),
        findPatients: () => Promise.resolve({ outcome: "not-found", candidates: [] }),
        fetchPatientRecord: (id, w): Promise<NormalizedCrmPatientRecord> => {
          if (id === "c-9999") return Promise.reject(new Error("boom"));
          return connector.fetchPatientRecord(id, w);
        },
      };
      const result = await buildAuditPackage(
        { branch: "B", auditDate: "2026-07-14", crmIds: ["c-1001", "c-9999"], outDir },
        stub
      );
      expect(result.metadata.failures).toEqual([
        { crmId: "c-9999", code: "ERROR", message: "boom" },
      ]);
      expect(result.manifest.patients.map((p) => p.crmId)).toEqual(["c-1001"]);
      expect(result.verification.ok).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("packageRootFor", () => {
  it("slugs the branch and defaults the audit date to today", () => {
    expect(packageRootFor({ branch: "Fermosa Imus", auditDate: "2026-07-14", outDir: "p" })).toBe(
      path.join("p", "fermosa-imus", "2026-07-14")
    );
    const todayRoot = packageRootFor({ branch: "X", outDir: "p" });
    expect(todayRoot).toMatch(/[/\\]x[/\\]\d{4}-\d{2}-\d{2}$/);
  });
});
