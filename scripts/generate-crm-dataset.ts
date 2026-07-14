/**
 * CLI for the CRM dataset generator (M0045) — read-only, resumable offline
 * sweep of the `CRMConnector` seam into a reproducible on-disk dataset
 * ("Dataset B"). See `services/crm/dataset/`.
 *
 * Usage (via the `dataset:crm` npm script — note the `--` that passes args
 * through pnpm to the script; both `@/services/crm` and
 * `@/services/crm/snapshot` import `server-only`, which needs the
 * `react-server` export condition to resolve to its non-throwing stub under
 * `tsx`, hence the script wrapper rather than bare `pnpm tsx ...`):
 *   pnpm dataset:crm -- --mode patient --crm-id c-1001 --out datasets/dataset-b
 *   pnpm dataset:crm -- --mode all --out datasets/dataset-b --resume
 *   pnpm dataset:crm -- --mode dateRange --from 2026-01-01 --to 2026-06-30 --out datasets/dataset-b
 *
 * Flags: --mode <patient|branch|dateRange|all> --crm-id <id> --branch <name>
 *        --from <yyyy-mm-dd> --to <yyyy-mm-dd> --out <dir> --resume
 */
import { generateDataset, type GenerateOptions } from "@/services/crm/dataset";

const MODES = ["patient", "branch", "dateRange", "all"] as const;
type Mode = (typeof MODES)[number];

function isMode(value: string | undefined): value is Mode {
  return MODES.includes(value as Mode);
}

export function parseArgs(argv: string[]): GenerateOptions {
  const values = new Map<string, string>();
  let resume = false;

  // `pnpm dataset:crm -- --mode ...` inserts a literal "--" separator ahead
  // of the passthrough args on this pnpm/corepack setup (verified locally,
  // since the script itself takes no args of its own) — strip it so it is
  // never mistaken for a flag.
  const tokens = argv.filter((token) => token !== "--");

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (token === "--resume") {
      resume = true;
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
    values.set(key, next);
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
    crmId: values.get("crm-id"),
    branch: values.get("branch"),
    window: from && to ? { from, to } : undefined,
    outDir,
    resume,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = await generateDataset(opts);

  console.log(
    `Dataset B generated at ${opts.outDir}: ${manifest.patients.length} patient(s), ` +
      `${manifest.failures.length} failure(s), ${manifest.warnings.length} warning(s), ` +
      `${manifest.retrievalDurationMs}ms retrieval time.`
  );

  process.exitCode = manifest.failures.length ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error("CRM dataset generation failed:", error);
  process.exitCode = 1;
});
