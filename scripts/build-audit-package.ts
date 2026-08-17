/**
 * CLI for the audit package builder (M0051) — read-only, reproducible
 * evidence bundle for one branch/audit-date. See `services/audit-package/`.
 *
 * Usage (via the `audit:package` npm script — the `--` passes args through
 * pnpm; `server-only` needs the `react-server` condition under tsx):
 *   pnpm audit:package -- --branch "Fermosa Imus" --crm-id c-1002 --crm-id c-1007 --out audit-packages
 *   pnpm audit:package -- --branch "Fermosa Imus" --from 2026-01-01 --to 2026-06-30 --out audit-packages
 *   pnpm audit:package -- --branch "Fermosa Imus" --crm-id c-1002 --out audit-packages --verify
 *
 * Flags: --branch <name>  --crm-id <id> (repeatable)  --from/--to <yyyy-mm-dd>
 *        --audit-date <yyyy-mm-dd>  --out <dir>  --verify
 */
import { getCRMConnector } from "@/services/crm";
import { buildAuditPackage, packageRootFor, verifyAuditPackage } from "@/services/audit-package";

export interface CliOptions {
  branch: string;
  crmIds?: string[];
  window?: { from: string; to: string };
  auditDate?: string;
  outDir: string;
  verify: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  const crmIds: string[] = [];
  let verify = false;

  const tokens = argv.filter((token) => token !== "--");
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (token === "--verify") {
      verify = true;
      continue;
    }
    if (!token.startsWith("--")) throw new Error(`Unexpected argument "${token}"`);
    const key = token.slice(2);
    const next = tokens[i + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    if (key === "crm-id") crmIds.push(next);
    else values.set(key, next);
    i++;
  }

  const branch = values.get("branch");
  if (!branch) throw new Error("--branch is required");
  const outDir = values.get("out");
  if (!outDir) throw new Error("--out is required");

  const from = values.get("from");
  const to = values.get("to");
  if (Boolean(from) !== Boolean(to)) throw new Error("--from and --to must be provided together");
  if (crmIds.length === 0 && !from) {
    throw new Error("provide --crm-id (repeatable) or --from/--to");
  }

  return {
    branch,
    crmIds: crmIds.length > 0 ? crmIds : undefined,
    window: from && to ? { from, to } : undefined,
    auditDate: values.get("audit-date"),
    outDir,
    verify,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const connector = getCRMConnector();
  const isLive = connector.kind !== "mock";
  console.log(
    `CRM connector: ${connector.kind}${isLive ? " — LIVE CRM (read-only)" : " (fixtures)"}. ` +
      `Set CRM_CONNECTOR=mock for a dry run.`
  );

  if (opts.verify) {
    const root = packageRootFor(opts);
    const report = verifyAuditPackage(root);
    const bad = report.patients.filter((p) => !p.ok);
    console.log(
      `Verify ${root}: packageHash ${report.ok ? "OK" : "MISMATCH"}, ` +
        `${report.patients.length - bad.length}/${report.patients.length} patient(s) intact.`
    );
    for (const p of bad) console.error(`  ✗ ${p.crmId}: ${p.issues.join("; ")}`);
    process.exitCode = report.ok ? 0 : 1;
    return;
  }

  const result = await buildAuditPackage(opts, connector);
  const m = result.manifest;
  console.log(
    `Audit package at ${result.packageRoot}: ${m.patients.length} patient(s), ` +
      `packageHash ${m.packageHash.slice(0, 12)}…, ` +
      `verification ${result.verification.ok ? "OK" : "FAILED"}` +
      `${result.metadata.skipped.length ? `, ${result.metadata.skipped.length} skipped` : ""}` +
      `${result.metadata.failures.length ? `, ${result.metadata.failures.length} failed` : ""}.`
  );
  process.exitCode = result.verification.ok && result.metadata.failures.length === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error("Audit package build failed:", error);
  process.exitCode = 1;
});
