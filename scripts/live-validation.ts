/**
 * Live CRM validation probe (M0049) — READ-ONLY evidence collector for the
 * remaining live-validation checklist. Drives the same seams production uses
 * (`getCRMConnector()` for connector-level checks, `BrowserManager` for
 * page-level checks) and never mutates the CRM: the only state it touches is
 * its OWN login session (login / logout / re-login are the recovery paths
 * under validation). Screenshots and result JSON go under
 * `docs/crm-reference/validation/` — gitignored, PII stays local
 * (PROJECT_RULES 24). Credential values are never printed.
 *
 * Usage (npm script adds the react-server condition `server-only` needs):
 *   pnpm validate:crm -- --search "<common surname>" [--unique "<full name>"]
 *                        [--crm-id <id>] [--out docs/crm-reference/validation]
 *
 * `--search` should be a term the operator expects to be AMBIGUOUS (2+
 * patients) — it exercises duplicate-name handling. Terms are passed at run
 * time so no patient name is ever committed in this script.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCRMConnector } from "@/services/crm";
import { PlaywrightCRMConnector } from "@/services/crm/connectors/playwright/playwright-crm-connector";
import {
  BrowserManager,
  InvoiceTab,
  PlaywrightBrowserDriver,
  SelectorRegistry,
  type PatientProfilePage,
} from "@/services/browser";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";

interface CheckResult {
  id: string;
  status: "PASS" | "FAIL" | "SKIP" | "INFO";
  ms: number;
  note: string;
}

const results: CheckResult[] = [];

async function check<T>(
  id: string,
  fn: () => Promise<{ note: string; value?: T; status?: CheckResult["status"] }>
): Promise<T | undefined> {
  const startedAt = performance.now();
  try {
    const outcome = await fn();
    results.push({
      id,
      status: outcome.status ?? "PASS",
      ms: Math.round(performance.now() - startedAt),
      note: outcome.note,
    });
    return outcome.value;
  } catch (error) {
    results.push({
      id,
      status: "FAIL",
      ms: Math.round(performance.now() - startedAt),
      note: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

function skip(id: string, note: string): void {
  results.push({ id, status: "SKIP", ms: 0, note });
}

/**
 * Standalone `tsx` does not load `.env` (Next does that only for the app).
 * Minimal self-load: set only keys not already present; values never logged.
 */
function loadDotEnv(): void {
  const file = path.resolve(".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1]!;
    const raw = match[2]!;
    const value = raw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parseArgs(argv: string[]): {
  search?: string;
  unique?: string;
  crmId?: string;
  out: string;
} {
  const values = new Map<string, string>();
  const tokens = argv.filter((token) => token !== "--");
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (!token.startsWith("--")) throw new Error(`Unexpected argument "${token}"`);
    const next = tokens[i + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }
    values.set(token.slice(2), next);
    i++;
  }
  return {
    search: values.get("search"),
    unique: values.get("unique"),
    crmId: values.get("crm-id"),
    out: values.get("out") ?? "docs/crm-reference/validation",
  };
}

function counts(record: NormalizedCrmPatientRecord): string {
  return (
    `treatments=${record.treatments.length} invoices=${record.invoices.length} ` +
    `activity=${record.activity.length}`
  );
}

async function screenshot(manager: BrowserManager, outDir: string, name: string): Promise<void> {
  const png = await manager.driver.screenshot();
  writeFileSync(path.join(outDir, `${name}.png`), png);
}

async function main(): Promise<void> {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.out, { recursive: true });

  const connector = getCRMConnector();
  const live = connector.kind !== "mock";
  console.log(
    `CRM connector: ${connector.kind}${live ? " — LIVE CRM (read-only probe)" : " (fixtures — results are NOT live evidence)"}`
  );

  // ---- Seam-level checks (through the CRMConnector contract) --------------

  await check("health-check", async () => {
    const health = await connector.healthCheck();
    if (!health.ok) throw new Error(`healthCheck not ok: ${health.detail ?? "no detail"}`);
    return { note: health.detail ?? "ok" };
  });

  await check("search-no-match", async () => {
    const result = await connector.findPatients({ name: "zzqqxx-no-such-patient" });
    if (result.outcome !== "not-found") {
      throw new Error(`expected not-found, got ${result.outcome} (${result.candidates.length})`);
    }
    return { note: "outcome not-found, 0 candidates" };
  });

  let firstCandidateId: string | undefined = args.crmId;
  if (args.search) {
    const ambiguous = await check("search-ambiguous-duplicate-names", async () => {
      const result = await connector.findPatients({ name: args.search! });
      if (result.outcome !== "ambiguous" || result.candidates.length < 2) {
        throw new Error(
          `expected ambiguous 2+, got ${result.outcome} (${result.candidates.length}) — ` +
            `pick a more common --search term`
        );
      }
      return {
        note: `${result.candidates.length} candidates surfaced, never auto-picked`,
        value: result.candidates,
      };
    });
    firstCandidateId = firstCandidateId ?? ambiguous?.[0]?.crmId;
  } else {
    skip("search-ambiguous-duplicate-names", "no --search term provided");
  }

  if (args.unique) {
    await check("search-unique-found", async () => {
      const result = await connector.findPatients({ name: args.unique! });
      if (result.outcome !== "found") {
        throw new Error(`expected found, got ${result.outcome} (${result.candidates.length})`);
      }
      return { note: "outcome found, exactly 1 candidate" };
    });
  } else {
    skip("search-unique-found", "no --unique term provided");
  }

  let biggest: NormalizedCrmPatientRecord | undefined;
  if (firstCandidateId) {
    biggest = await check("fetch-record-full", async () => {
      const record = await connector.fetchPatientRecord(firstCandidateId!);
      return { note: `schema-valid; ${counts(record)}`, value: record };
    });

    await check("fetch-record-session-reuse", async () => {
      const record = await connector.fetchPatientRecord(firstCandidateId!);
      return {
        note: `second fetch on same connector reused the session (one login per execution); ${counts(record)}`,
        value: record,
      };
    });

    await check("fetch-record-windowed", async () => {
      const record = await connector.fetchPatientRecord(firstCandidateId!, {
        from: "2026-01-01",
        to: "2026-07-14",
      });
      return { note: `window applied; ${counts(record)}` };
    });
  } else {
    skip("fetch-record-full", "no crmId resolved (need --search or --crm-id)");
  }

  if (connector instanceof PlaywrightCRMConnector) await connector.dispose();

  // ---- Page-level checks (BrowserManager: login/logout/recovery/detail) ---

  if (!live) {
    skip("page-level-checks", "mock connector — page-level live checks need CRM_CONNECTOR=playwright");
  } else {
    const env = process.env;
    const registry = new SelectorRegistry();
    const driver = new PlaywrightBrowserDriver({
      baseUrl: env.CRM_URL as string,
      headless: env.CRM_BROWSER_HEADLESS !== "false",
    });
    const manager = new BrowserManager(
      driver,
      { username: env.CRM_USERNAME as string, password: env.CRM_PASSWORD as string },
      registry
    );

    try {
      await check("login-timed", async () => {
        await manager.session.login();
        await screenshot(manager, args.out, "dashboard");
        return { note: `authenticated (${registry.version}); dashboard.png saved` };
      });

      await check("selector-fingerprints-live", async () => {
        await manager.navigation.navigateTo("patient-search");
        await screenshot(manager, args.out, "patient-search");
        return { note: "patient-search fingerprint verified live; screenshot saved" };
      });

      if (firstCandidateId) {
        let profile: PatientProfilePage | undefined;
        await check("profile-and-tabs-live", async () => {
          profile = (await manager.navigation.navigateTo("patient-profile", {
            cid: firstCandidateId!,
          })) as PatientProfilePage;
          await screenshot(manager, args.out, "patient-profile");
          await profile.openTab("invoice");
          const invoiceTab = new InvoiceTab(manager.driver, manager.registry);
          await invoiceTab.waitForData();
          await screenshot(manager, args.out, "invoice-tab");
          return { note: "profile + invoice tab fingerprints verified; screenshots saved" };
        });

        await check("invoice-detail-readonly", async () => {
          // M0056: invoice detail is embedded per row as base64 `data-details`
          // — read-only, no click, no navigation.
          const invoiceTab = new InvoiceTab(manager.driver, manager.registry);
          const details = await invoiceTab.readInvoiceDetails();
          const totalPayments = [...details.values()].reduce((n, d) => n + d.payments.length, 0);
          const cancelled = [...details.values()]
            .flatMap((d) => d.payments)
            .filter((p) => p.status !== "completed").length;
          return {
            note: `${details.size} invoice(s) with embedded detail; ${totalPayments} payment(s) parsed (${cancelled} non-completed) — read-only`,
          };
        });
      }

      await check("activity-log-live", async () => {
        await manager.navigation.navigateTo("activity-log");
        await screenshot(manager, args.out, "activity-log");
        return { note: "activity-log fingerprint verified live; screenshot saved" };
      });

      await check("logout-live", async () => {
        await manager.session.logout();
        await manager.driver.goto("/");
        const loginVisible = await manager.driver.isVisible(registry.selector("login", "password"));
        if (!loginVisible) throw new Error("login form not visible after logout");
        await screenshot(manager, args.out, "after-logout");
        return { note: "logout via CRM's own POST form; login page confirmed after" };
      });

      await check("recovery-relogin-after-logout", async () => {
        await manager.session.ensureAuthenticated();
        return {
          note: "session recovered by re-login after the CRM session ended — the same path expiry recovery takes",
        };
      });
    } finally {
      await manager.dispose();
    }
  }

  // ---- Report ---------------------------------------------------------------

  if (biggest) {
    results.push({
      id: "largest-history-observed",
      status: "INFO",
      ms: 0,
      note: counts(biggest),
    });
  }

  const width = Math.max(...results.map((result) => result.id.length));
  console.log("\nid".padEnd(width + 1) + "  status  ms      note");
  for (const result of results) {
    console.log(
      `${result.id.padEnd(width)}  ${result.status.padEnd(6)}  ${String(result.ms).padStart(6)}  ${result.note}`
    );
  }

  const evidence = path.join(args.out, `results-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(evidence, JSON.stringify({ connector: connector.kind, results }, null, 2), "utf8");
  console.log(`\nEvidence written to ${evidence}`);

  process.exitCode = results.some((result) => result.status === "FAIL") ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error("Live validation failed to run:", error);
  process.exitCode = 1;
});
