// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { MockBrowserDriver } from "@/services/browser";
import { normalizedCrmPatientRecordSchema } from "@/services/crm/types";
import { normalizeStatus } from "./normalizer";
import { PlaywrightCRMConnector } from "./playwright-crm-connector";

/**
 * Connector contract tests on the MOCK driver — no live CRM, no Playwright.
 * The mock simulates the real CRM's structure (server-rendered patients
 * list, form-control treatment tables, AJAX invoice DataTable, filterable
 * activity log), so these tests exercise the connector's REAL parsing,
 * normalization, and error mapping end to end.
 */

const config = { url: "https://crm.example.test", username: "bot", password: "pw" };

let driver: MockBrowserDriver;
let connector: PlaywrightCRMConnector;

beforeEach(() => {
  driver = new MockBrowserDriver();
  connector = new PlaywrightCRMConnector({ driver, config });
});

describe("healthCheck", () => {
  it("reports authenticated once the session is up", async () => {
    await connector.findPatients({ name: "Santos" }); // triggers login
    const health = await connector.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.detail).toContain("crm-selectors/v1");
  });

  it("reports failures as data, never throws", async () => {
    driver.failNextNavigations(10);
    const health = await connector.healthCheck();
    expect(health.ok).toBe(false);
  });
});

describe("findPatients", () => {
  it("empty query is not-found without touching the browser", async () => {
    const result = await connector.findPatients({});
    expect(result).toEqual({ outcome: "not-found", candidates: [] });
    expect(driver.state.authenticated).toBe(false);
  });

  it("name search resolving to one patient is found", async () => {
    const result = await connector.findPatients({ name: "Santos" });
    expect(result.outcome).toBe("found");
    expect(result.candidates[0]).toMatchObject({
      crmId: "1001",
      fullName: "Santos, Maria",
      lastVisit: "2026-07-10",
    });
  });

  it("duplicate names are ambiguous with every candidate — never auto-picked", async () => {
    const result = await connector.findPatients({ name: "Catherine" });
    expect(result.outcome).toBe("ambiguous");
    expect(result.candidates.map((candidate) => candidate.crmId).sort()).toEqual(["1004", "1005"]);
  });

  it("email refines ambiguous name results client-side", async () => {
    const result = await connector.findPatients({
      name: "Catherine",
      email: "catherine.b@example.test",
    });
    expect(result.outcome).toBe("found");
    expect(result.candidates[0]?.crmId).toBe("1005");
  });

  it("mobile search uses the CRM's own mobile filter", async () => {
    const result = await connector.findPatients({ mobileNo: "0917-100-4000" });
    expect(result.outcome).toBe("found");
    expect(result.candidates[0]?.crmId).toBe("1004");
  });

  it("unknown names are not-found", async () => {
    const result = await connector.findPatients({ name: "Nobody Real" });
    expect(result).toEqual({ outcome: "not-found", candidates: [] });
  });

  it("crmId resolves by direct profile navigation (dob included)", async () => {
    const result = await connector.findPatients({ crmId: "1001" });
    expect(result.outcome).toBe("found");
    expect(result.candidates[0]).toMatchObject({
      crmId: "1001",
      dateOfBirth: "1992-03-14",
    });
  });

  it("an unknown crmId is not-found (the CRM's 404)", async () => {
    const result = await connector.findPatients({ crmId: "9999" });
    expect(result).toEqual({ outcome: "not-found", candidates: [] });
  });

  it("dob-only queries cannot be satisfied by the live CRM — documented divergence", async () => {
    const result = await connector.findPatients({ dob: "1992-03-14" });
    expect(result).toEqual({ outcome: "not-found", candidates: [] });
  });
});

describe("fetchPatientRecord", () => {
  it("assembles a schema-valid normalized record with provenance", async () => {
    const record = await connector.fetchPatientRecord("1001");

    expect(() => normalizedCrmPatientRecordSchema.parse(record)).not.toThrow();
    expect(record.connectorKind).toBe("browser-automation");
    expect(record.sourceRef).toBe("crm-selectors/v1 /clients/1001");
    expect(record.patient).toMatchObject({
      crmId: "1001",
      fullName: "Santos, Maria",
      firstName: "Maria",
      dateOfBirth: "1992-03-14",
    });

    expect(record.treatments).toHaveLength(2);
    expect(record.treatments[0]).toMatchObject({
      performedAt: "2026-07-03",
      branch: { crmBranchId: "1", name: "Fermosa - Trece Martires", platformBranchId: null },
      procedure: "GLUTA DRIP",
      packageName: "GLUTA DRIP 10 SESSION",
      sessionsTotal: 10,
      performedBy: { name: "02 Shiela Layam", role: "unknown" },
      locked: false,
    });

    expect(record.invoices).toEqual([
      {
        refNo: "007-162320",
        serviceName: "GLUTA DRIP 10 SESSION",
        amount: "15999.00",
        amountPaid: "14000.00",
        balance: "1999.00",
        status: "partial",
        dateUpdated: "2026-07-10",
        payments: null, // detail capability is off in v1
      },
    ]);

    expect(record.activity).toHaveLength(1);
    expect(record.activity[0]).toMatchObject({
      occurredAt: "2026-07-10T18:32:52",
      logName: "payments",
      causedBy: "Fermosa Trece",
    });
    expect(record.activity[0]?.changes).toContainEqual({
      field: "amount_paid",
      oldValue: null,
      newValue: "2500",
    });
  });

  it("applies the retrieval window to treatments, invoices, and activity", async () => {
    const record = await connector.fetchPatientRecord("1001", {
      from: "2026-07-05",
      to: "2026-07-15",
    });
    expect(record.treatments.map((treatment) => treatment.performedAt)).toEqual(["2026-07-10"]);
    expect(record.invoices).toHaveLength(1);
    expect(record.activity).toHaveLength(1);

    const outside = await connector.fetchPatientRecord("1001", {
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(outside.treatments).toEqual([]);
    expect(outside.invoices).toEqual([]);
    expect(outside.activity).toEqual([]);
  });

  it("patients without treatments or invoices produce empty arrays, not errors", async () => {
    const record = await connector.fetchPatientRecord("1004");
    expect(record.treatments).toEqual([]);
    expect(record.invoices).toEqual([]);
    expect(record.activity).toEqual([]);
  });

  it("unknown cids throw NOT_FOUND — mock connector parity", async () => {
    await expect(connector.fetchPatientRecord("9999")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("error mapping", () => {
  it("captcha at login surfaces CRM_CHALLENGE", async () => {
    driver.showCaptcha(true);
    await expect(connector.findPatients({ name: "Santos" })).rejects.toMatchObject({
      code: "CRM_CHALLENGE",
    });
  });

  it("layout drift on the patients list surfaces CRM_LAYOUT", async () => {
    driver.breakLayout("/clients");
    await expect(connector.findPatients({ name: "Santos" })).rejects.toMatchObject({
      code: "CRM_LAYOUT",
    });
  });

  it("persistent unavailability surfaces CRM_UNAVAILABLE", async () => {
    driver.failNextNavigations(10);
    await expect(connector.findPatients({ name: "Santos" })).rejects.toMatchObject({
      code: "CRM_UNAVAILABLE",
    });
  });

  it("session reuse: one login serves consecutive calls", async () => {
    await connector.findPatients({ name: "Santos" });
    await connector.fetchPatientRecord("1001");
    // The mock counts logins implicitly: a second login would reset the URL
    // to "/" — after fetch we're on the activity log page instead.
    expect(driver.state.authenticated).toBe(true);
    expect(driver.state.url).toContain("/activity-logs");
  });
});

describe("normalizeStatus", () => {
  it("maps the CRM's literals to normalized statuses", () => {
    expect(normalizeStatus("PARTIALLY PAID")).toBe("partial");
    expect(normalizeStatus("FULLY PAID")).toBe("paid");
    expect(normalizeStatus("NOT PAID")).toBe("unpaid");
    expect(normalizeStatus("CANCELLED")).toBe("cancelled");
    expect(normalizeStatus("Weird Future Status")).toBe("weird future status");
  });
});
