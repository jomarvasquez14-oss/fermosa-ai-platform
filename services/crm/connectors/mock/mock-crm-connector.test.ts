// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizedCrmPatientRecordSchema } from "@/services/crm/types";
import { FIXTURE_RECORDS } from "./fixtures";
import { MockCRMConnector } from "./mock-crm-connector";

const connector = new MockCRMConnector();

describe("MockCRMConnector.findPatients", () => {
  it("finds a unique patient by name", async () => {
    const result = await connector.findPatients({ name: "Santos" });
    expect(result.outcome).toBe("found");
    expect(result.candidates[0]).toMatchObject({ crmId: "c-1001", fullName: "Santos, Maria" });
  });

  it("returns ambiguous with ALL candidates for duplicate names — never auto-picks", async () => {
    const result = await connector.findPatients({ name: "Catherine Cruz" });
    expect(result.outcome).toBe("ambiguous");
    expect(result.candidates.map((candidate) => candidate.crmId).sort()).toEqual([
      "c-1004",
      "c-1005",
    ]);
    // Candidates carry the disambiguators a human needs.
    expect(result.candidates[0]!.dateOfBirth).not.toBe(result.candidates[1]!.dateOfBirth);
  });

  it("disambiguates duplicates by date of birth", async () => {
    const result = await connector.findPatients({ name: "Catherine Cruz", dob: "1988-11-02" });
    expect(result.outcome).toBe("found");
    expect(result.candidates[0]!.crmId).toBe("c-1004");
  });

  it("matches by mobile number ignoring formatting", async () => {
    const result = await connector.findPatients({ mobileNo: "0917-1001-000" });
    expect(result.outcome).toBe("found");
    expect(result.candidates[0]!.crmId).toBe("c-1001");
  });

  it("returns not-found as data, not an exception", async () => {
    const result = await connector.findPatients({ name: "Nonexistent Person" });
    expect(result).toEqual({ outcome: "not-found", candidates: [] });
  });

  it("returns not-found for an empty query", async () => {
    const result = await connector.findPatients({});
    expect(result.outcome).toBe("not-found");
  });

  it.each([
    ["trigger:unavailable", "CRM_UNAVAILABLE"],
    ["trigger:forbidden", "CRM_FORBIDDEN"],
    ["trigger:layout", "CRM_LAYOUT"],
  ])("simulates infrastructure failure %s as a typed AppError", async (name, code) => {
    await expect(connector.findPatients({ name })).rejects.toMatchObject({ code });
  });
});

describe("MockCRMConnector.fetchPatientRecord", () => {
  it("returns a schema-valid normalized record with provenance", async () => {
    const record = await connector.fetchPatientRecord("c-1001");
    expect(() => normalizedCrmPatientRecordSchema.parse(record)).not.toThrow();
    expect(record.connectorKind).toBe("mock");
    expect(record.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(record.treatments[0]).toMatchObject({
      procedure: "Diamond Peel",
      performedBy: { role: "aesthetician" },
    });
    expect(record.invoices[0]).toMatchObject({ refNo: "INV-88101", status: "paid" });
  });

  it("every fixture is schema-valid (dataset integrity)", async () => {
    for (const fixture of FIXTURE_RECORDS) {
      const record = await connector.fetchPatientRecord(fixture.patient.crmId);
      expect(() => normalizedCrmPatientRecordSchema.parse(record)).not.toThrow();
    }
  });

  it("covers the required scenarios", async () => {
    const multi = await connector.fetchPatientRecord("c-1002");
    expect(multi.treatments.length).toBe(3);
    expect(multi.treatments[0]!.packageName).toBe("GLUTA DRIP 10 SESSION");

    const none = await connector.fetchPatientRecord("c-1003");
    expect(none.treatments).toEqual([]);

    const missingInvoice = await connector.fetchPatientRecord("c-1006");
    expect(missingInvoice.treatments.length).toBeGreaterThan(0);
    expect(missingInvoice.invoices).toEqual([]);

    const noActivity = await connector.fetchPatientRecord("c-1007");
    expect(noActivity.activity).toEqual([]);

    const deleted = await connector.fetchPatientRecord("c-1008");
    expect(deleted.treatments).toEqual([]);
    expect(deleted.activity.some((event) => event.logName === "deleted")).toBe(true);

    const edited = await connector.fetchPatientRecord("c-1009");
    const edit = edited.activity.find((event) => event.logName === "updated");
    expect(edit?.changes).toContainEqual({
      field: "amount_paid",
      oldValue: "800.00",
      newValue: "500.00",
    });
  });

  it("filters treatments, invoices, and activity to the retrieval window", async () => {
    const record = await connector.fetchPatientRecord("c-1002", {
      from: "2026-07-05",
      to: "2026-07-06",
    });
    expect(record.treatments.map((treatment) => treatment.performedAt)).toEqual([
      "2026-07-05",
      "2026-07-06",
    ]);
    expect(record.invoices).toEqual([]); // dated 2026-07-04, outside window
  });

  it("throws NOT_FOUND for an unknown crmId", async () => {
    await expect(connector.fetchPatientRecord("c-9999")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("MockCRMConnector.healthCheck", () => {
  it("reports healthy with fixture provenance", async () => {
    const health = await connector.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.detail).toContain("fixtures/v1");
  });
});
