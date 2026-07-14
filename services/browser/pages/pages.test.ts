// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { MockBrowserDriver, textCell } from "../drivers/mock/mock-driver";
import { SelectorRegistry } from "../selectors";
import { ActivityLogPage } from "./activity-log-page";
import { InvoiceTab } from "./invoice-tab";
import { PatientProfilePage } from "./patient-profile-page";
import { PatientsPage } from "./patients-page";
import { TreatmentTab } from "./treatment-tab";

/**
 * Page-object parsing tests against the mock driver's demo CRM (fictional
 * data mirroring the real captures' structure). Layout-drift paths are
 * exercised with scripted table overrides.
 */

const registry = new SelectorRegistry();
let driver: MockBrowserDriver;

async function login(): Promise<void> {
  await driver.goto("/login");
  await driver.fill(registry.selector("login", "username"), "bot");
  await driver.fill(registry.selector("login", "password"), "pw");
  await driver.click(registry.selector("login", "submit"));
}

beforeEach(async () => {
  driver = new MockBrowserDriver();
  await login();
});

describe("PatientsPage", () => {
  it("searches by name and maps rows to cid-keyed results", async () => {
    await driver.goto("/clients");
    const page = new PatientsPage(driver, registry);
    const rows = await page.search({ name: "Santos" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      crmId: "1001",
      fullName: "Santos, Maria",
      membershipType: "MEMBER",
      lastVisit: "2026-07-10",
    });
  });

  it("searches by mobile number", async () => {
    await driver.goto("/clients");
    const page = new PatientsPage(driver, registry);
    const rows = await page.search({ mobile: "09171004000" });
    expect(rows.map((row) => row.crmId)).toEqual(["1004"]);
  });

  it("returns [] for the DataTables empty-state row", async () => {
    await driver.goto("/clients");
    const page = new PatientsPage(driver, registry);
    expect(await page.search({ name: "Nobody Real" })).toEqual([]);
  });

  it('recognizes the live "No clients available" empty row (M0049)', async () => {
    await driver.goto("/clients");
    // The live CRM's server-rendered empty state — a phrasing the old
    // /no (data|matching)/ guard missed, crashing the no-match search path.
    driver.setTable(registry.selector("patient-search", "resultsTable"), {
      headers: ["", "NAME", "EMAIL", "MOBILE", "TYPE", "LAST VISIT", "CREATED AT", "ACTIONS"],
      rows: [[textCell("No clients available")]],
    });
    const page = new PatientsPage(driver, registry);
    expect(await page.search({ name: "zz-nobody" })).toEqual([]);
  });

  it("duplicate names return every candidate — never auto-picked here", async () => {
    await driver.goto("/clients");
    const page = new PatientsPage(driver, registry);
    const rows = await page.search({ name: "Cruz, Catherine" });
    expect(rows.map((row) => row.crmId).sort()).toEqual(["1004", "1005"]);
  });

  it("a results table without the expected columns is CRM_LAYOUT", async () => {
    await driver.goto("/clients");
    driver.setTable(registry.selector("patient-search", "resultsTable"), {
      headers: ["SOMETHING", "ELSE"],
      rows: [[textCell("x"), textCell("y")]],
    });
    const page = new PatientsPage(driver, registry);
    await expect(page.search({ name: "Santos" })).rejects.toMatchObject({ code: "CRM_LAYOUT" });
  });

  it("a row without a View-client link is CRM_LAYOUT, not silent data loss", async () => {
    await driver.goto("/clients");
    driver.setTable(registry.selector("patient-search", "resultsTable"), {
      headers: ["", "NAME", "EMAIL", "MOBILE", "TYPE", "LAST VISIT", "CREATED AT", "ACTIONS"],
      rows: [
        [
          textCell("1."),
          textCell("Santos, Maria"),
          textCell("m@example.test"),
          textCell("0917"),
          textCell("MEMBER"),
          textCell("2026-07-10"),
          textCell("1 year ago"),
          textCell("no links here"),
        ],
      ],
    });
    const page = new PatientsPage(driver, registry);
    await expect(page.search({ name: "Santos" })).rejects.toMatchObject({ code: "CRM_LAYOUT" });
  });
});

describe("PatientProfilePage", () => {
  it("reads the profile card, demographics, and lock state", async () => {
    const page = new PatientProfilePage(driver, registry);
    await page.open("1001");
    expect((await page.readPatientCard()).fullName).toBe("Santos, Maria");
    expect(await page.readDemographics()).toMatchObject({
      firstName: "Maria",
      lastName: "Santos",
      nickname: "Mia",
      dateOfBirth: "1992-03-14",
      email: "maria.santos@example.test",
    });
    expect(await page.isTreatmentLocked()).toBe(false);
    expect(await page.crmIdFromUrl()).toBe("1001");
  });

  it("an unknown cid fails the fingerprint (the CRM's 404)", async () => {
    const page = new PatientProfilePage(driver, registry);
    await expect(page.open("9999")).rejects.toMatchObject({ code: "CRM_LAYOUT" });
  });
});

describe("TreatmentTab", () => {
  it("parses package panels: title progress + per-session rows from form controls", async () => {
    const profile = new PatientProfilePage(driver, registry);
    await profile.open("1001");
    await profile.openTab("treatment-records");

    const packages = await new TreatmentTab(driver, registry).read();
    expect(packages).toHaveLength(1);
    expect(packages[0]).toMatchObject({
      packageName: "GLUTA DRIP 10 SESSION",
      sessionsDone: 2,
      sessionsTotal: 10,
    });
    expect(packages[0]?.rows).toEqual([
      {
        date: "2026-07-03",
        crmBranchId: "1",
        branchName: "Fermosa - Trece Martires",
        promoCode: null,
        procedure: "GLUTA DRIP",
        intensitySettings: null,
        performedBy: "02 Shiela Layam",
      },
      {
        date: "2026-07-10",
        crmBranchId: "1",
        branchName: "Fermosa - Trece Martires",
        promoCode: "PROMO10",
        procedure: "GLUTA DRIP",
        intensitySettings: "Level 2",
        performedBy: "01 Dyan Montinola",
      },
    ]);
  });

  it("a panel table missing the USER column is CRM_LAYOUT", async () => {
    const profile = new PatientProfilePage(driver, registry);
    await profile.open("1001");
    driver.setTable(`${registry.selector("treatment-tab", "panels")}:nth-child(1) table`, {
      headers: ["DATE", "BRANCH", "PROMO CODE", "PROCEDURE", "INTENSITY SETTINGS"],
      rows: [],
    });
    await expect(new TreatmentTab(driver, registry).read()).rejects.toMatchObject({
      code: "CRM_LAYOUT",
    });
  });
});

describe("InvoiceTab", () => {
  it("reads the AJAX DataTable rows with verbatim status literals", async () => {
    const profile = new PatientProfilePage(driver, registry);
    await profile.open("1001");
    await profile.openTab("invoice");

    const invoices = await new InvoiceTab(driver, registry).readInvoices();
    expect(invoices).toEqual([
      {
        refNo: "007-162320",
        serviceName: "GLUTA DRIP 10 SESSION",
        amount: "15,999.00",
        amountPaid: "14,000.00",
        balance: "1,999.00",
        statusLiteral: "PARTIALLY PAID",
        dateUpdated: "2026-07-10",
      },
    ]);
  });

  it("returns [] for patients without invoices (DataTables empty cell)", async () => {
    const profile = new PatientProfilePage(driver, registry);
    await profile.open("1004");
    await profile.openTab("invoice");
    expect(await new InvoiceTab(driver, registry).readInvoices()).toEqual([]);
  });

  it("parses a detail view structurally: services + multi-payment installments", async () => {
    const profile = new PatientProfilePage(driver, registry);
    await profile.open("1001");
    driver.setTables(registry.selector("invoice-detail", "anyTable"), [
      {
        headers: ["SERVICE", "DESCRIPTION"],
        rows: [[textCell("GLUTA DRIP 10 SESSION"), textCell("GOLD DRIP")]],
      },
      {
        headers: [
          "DATE",
          "REFERENCE NO.",
          "AMOUNT PAID",
          "PAYMENT METHOD",
          "SERVICE",
          "REMARKS",
          "RECEIVED BY",
        ],
        rows: [
          [
            textCell("2026-05-10"),
            textCell("162320-001"),
            textCell("2,500.00"),
            textCell("Cash"),
            textCell("GLUTA DRIP 10 SESSION"),
            textCell("Post-care instructions"),
            textCell("102 Remelee Pulma"),
          ],
          [
            textCell("2026-05-15"),
            textCell("162320-002"),
            textCell("2,500.00"),
            textCell("Cash"),
            textCell("GLUTA DRIP 10 SESSION"),
            textCell("-"),
            textCell("67 May Abrasaldo"),
          ],
        ],
      },
    ]);

    const detail = await new InvoiceTab(driver, registry).readDetail();
    expect(detail.services).toEqual([
      { service: "GLUTA DRIP 10 SESSION", description: "GOLD DRIP" },
    ]);
    expect(detail.payments).toHaveLength(2);
    expect(detail.payments[0]).toMatchObject({
      referenceNo: "162320-001",
      amountPaid: "2,500.00",
      method: "Cash",
      receivedBy: "102 Remelee Pulma",
    });
    expect(detail.payments[1]?.remarks).toBeNull(); // "-" is absence
  });

  it("a detail view without a payments table is CRM_LAYOUT — never silent", async () => {
    const profile = new PatientProfilePage(driver, registry);
    await profile.open("1001");
    driver.setTables(registry.selector("invoice-detail", "anyTable"), [
      { headers: ["SERVICE", "DESCRIPTION"], rows: [] },
    ]);
    await expect(new InvoiceTab(driver, registry).readDetail()).rejects.toMatchObject({
      code: "CRM_LAYOUT",
    });
  });
});

describe("ActivityLogPage", () => {
  it("filters server-side and reads entries with nested field diffs", async () => {
    await driver.goto("/activity-logs");
    const page = new ActivityLogPage(driver, registry);
    const entries = await page.readFiltered({ keyword: "Santos, Maria" }, 5);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      logName: "payments",
      description: "Payments has been created",
      causedBy: "Fermosa Trece",
      date: "2026-07-10 18:32:52",
    });
    expect(entries[0]?.details).toMatchObject({
      "service.name": "GLUTA DRIP 10 SESSION",
      amount_paid: "2500",
    });
    expect(entries[0]?.oldDetails).toEqual({});
  });

  it("keyword misses return no entries", async () => {
    await driver.goto("/activity-logs");
    const page = new ActivityLogPage(driver, registry);
    expect(await page.readFiltered({ keyword: "Unrelated Person" }, 5)).toEqual([]);
  });

  it("datetime window excludes out-of-range entries", async () => {
    await driver.goto("/activity-logs");
    const page = new ActivityLogPage(driver, registry);
    const entries = await page.readFiltered(
      { keyword: "Santos", from: "2026-08-01T00:00", to: "2026-08-31T23:59" },
      5
    );
    expect(entries).toEqual([]);
  });

  it("respects the page budget — never a full scan", async () => {
    await driver.goto("/activity-logs");
    const page = new ActivityLogPage(driver, registry);
    // Demo data has one page; the cap must simply not loop beyond hasNextPage.
    const entries = await page.readFiltered({ keyword: "Santos" }, 1);
    expect(entries).toHaveLength(1);
  });

  it("a patient with no matching activity is [], not a phantom entry (M0049)", async () => {
    await driver.goto("/activity-logs");
    // Live empty state: one single-cell row — must never be parsed as an
    // activity entry (its empty Date crashed the normalizer before M0049).
    driver.setTable(registry.selector("activity-log", "table"), {
      headers: ["", "Log Name", "Description", "Caused By", "Date", "", "", "Details", "Old Details"],
      rows: [[textCell("No matching records found")]],
    });
    const page = new ActivityLogPage(driver, registry);
    expect(await page.readFiltered({ keyword: "Santos" }, 5)).toEqual([]);
  });

  it("expands the collapsed Filters panel before filling (live behavior, M0049)", async () => {
    await driver.goto("/activity-logs");
    driver.collapseActivityFilters(true);
    const page = new ActivityLogPage(driver, registry);
    // Without the client-side expand click, fill() times out on the hidden
    // inputs — exactly what the live /activity-logs page does when its theme
    // JS collapses the panel before the filter is touched.
    const entries = await page.readFiltered({ keyword: "Santos, Maria" }, 5);
    expect(entries).toHaveLength(1);
  });
});
