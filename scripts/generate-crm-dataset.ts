/**
 * CLI for the CRM dataset generator (M0045, expanded M0050) — read-only,
 * resumable, offline sweep of the `CRMConnector` seam into a reproducible
 * on-disk dataset ("Dataset B"). See `services/crm/dataset/`.
 *
 * Usage (via the `dataset:crm` npm script — the `--` passes args through pnpm;
 * both `@/services/crm` and `@/services/crm/snapshot` import `server-only`,
 * which needs the `react-server` export condition under `tsx`, hence the
 * script wrapper rather than bare `pnpm tsx ...`):
 *   pnpm dataset:crm -- --mode patient --crm-id c-1001 --crm-id c-1002 --out datasets/b
 *   pnpm dataset:crm -- --mode all --out datasets/b --resume
 *   pnpm dataset:crm -- --mode branch --branch "Fermosa Imus" --out datasets/b
 *   pnpm dataset:crm -- --mode dateRange --from 2026-01-01 --to 2026-06-30 --out datasets/b
 *   pnpm dataset:crm -- --mode all --out datasets/b --verify   (re-hash only, no CRM)
 *
 * Flags: --mode <patient|branch|dateRange|all>  --crm-id <id> (repeatable)
 *        --branch <name>  --from <yyyy-mm-dd> --to <yyyy-mm-dd>
 *        --out <dir>  --resume  --verify
 */
import { getCRMConnector } from "@/services/crm";
import {
  generateDataset,
  verifyGeneratedDataset,
  type GenerateOptions,
  type ProgressEvent,
} from "@/services/crm/dataset";

const MODES = ["patient", "branch", "dateRange", "all"] as const;
type Mode = (typeof MODES)[number];

function isMode(value: string | undefined): value is Mode {
  return MODES.includes(value as Mode);
}

export interface CliOptions extends GenerateOptions {
  verify: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  const crmIds: string[] = [];
  let resume = false;
  let verify = false;

  // `pnpm dataset:crm -- --mode ...` inserts a literal "--" separator ahead of
  // the passthrough args (verified locally) — strip it so it is never a flag.
  const tokens = argv.filter((token) => token !== "--");

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (token === "--resume") {
      resume = true;
      continue;
    }
    if (token === "--verify") {
      verify = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument "${token}"`);
    }
    const key = token.slice(2);
    const next = tokens[i + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    if (key === "crm-id") {
      crmIds.push(next);
    } else {
      values.set(key, next);
    }
    i++;
  }

  const mode = values.get("mode");
  if (!isMode(mode)) {
    throw new Error(`--mode must be one of ${MODES.join(" | ")} (got ${mode ?? "<none>"})`);
  }

  const outDir = values.get("out");
  if (!outDir) throw new Error("--out is required");

  const from = values.get("from");
  const to = values.get("to");
  if (Boolean(from) !== Boolean(to)) {
    throw new Error("--from and --to must be provided together");
  }

  return {
    mode,
    crmIds: crmIds.length > 0 ? crmIds : undefined,
    branch: values.get("branch"),
    window: from && to ? { from, to } : undefined,
    outDir,
    resume,
    verify,
  };
}

/** Renders one progress line to stderr — a live counter, not a log. */
function reportProgress(event: ProgressEvent): void {
  if (event.phase === "enumerate") {
    process.stderr.write(`\r  enumerating… ${event.done} patient(s) found`);
    return;
  }
  const total = event.total ?? 0;
  const eta = event.etaMs === null ? "—" : `${Math.ceil(event.etaMs / 1000)}s`;
  const current = event.crmId ? ` ${event.crmId}` : "";
  process.stderr.write(`\r  retrieving ${event.done}/${total} (ETA ${eta})${current}          `);
  if (event.done === total && total > 0) process.stderr.write("\n");
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  // Announce the connector before any retrieval — this tool reads whatever
  // CRM_CONNECTOR selects, so `pnpm dataset:crm` hits the LIVE CRM whenever
  // the connector is not the mock. Never let that be a silent surprise.
  const connector = getCRMConnector();
  const isLive = connector.kind !== "mock";
  console.log(
    `CRM connector: ${connector.kind}${isLive ? " — LIVE CRM (read-only)" : " (fixtures)"}. ` +
      `Set CRM_CONNECTOR=mock for a dry run.`
  );

  if (opts.verify) {
    // Re-hash only — never contacts the CRM.
    const report = verifyGeneratedDataset(opts);
    console.log(
      `Verify ${report.datasetRoot}: ${report.ok}/${report.checked} patient(s) intact, ` +
        `${report.issues.length} issue(s).`
    );
    for (const issue of report.issues) {
      console.error(`  ✗ ${issue.crmId} [${issue.kind}] ${issue.detail}`);
    }
    process.exitCode = report.issues.length ? 1 : 0;
    return;
  }

  const manifest = await generateDataset({ ...opts, onProgress: reportProgress }, connector);
  const s = manifest.summary;

  console.log(
    `Dataset B (${manifest.mode}) at ${opts.outDir}/crm: ` +
      `${s.included} written, ${s.skipped} filtered out, ${s.failed} failed, ` +
      `${manifest.duplicates.length} duplicate(s), ${(s.totalBytes / 1024).toFixed(1)} KiB, ` +
      `${manifest.retrievalDurationMs}ms retrieval.`
  );
  if (manifest.warnings.length) {
    for (const warning of manifest.warnings) console.warn(`  ! ${warning}`);
  }

  process.exitCode = manifest.failures.length ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error("CRM dataset generation failed:", error);
  process.exitCode = 1;
});
