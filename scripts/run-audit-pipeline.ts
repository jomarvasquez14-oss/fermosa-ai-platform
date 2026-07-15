/**
 * CLI for the scheduled audit pipeline (M0054) — invokable by an OS scheduler
 * or CI cron (no daemon). See `services/pipeline/`.
 *
 * Usage (via the `audit:pipeline` npm script; `server-only` needs the
 * `react-server` condition under tsx):
 *   pnpm audit:pipeline -- --now --submission <submissionId>   # run one submission now
 *   pnpm audit:pipeline -- --due                               # run every due schedule
 *
 * The actor is a system Super-Admin context (the pipeline is a privileged,
 * unattended job). Findings/reports are written through the same services a
 * human audit uses.
 */
import { ROLES } from "@/lib/auth/roles";
import type { Actor } from "@/services/audit-submission-service";
import { runDueSchedules, runSubmissionPipeline } from "@/services/pipeline";

interface CliOptions {
  mode: "now" | "due";
  submissionId?: string;
}

export function parseArgs(argv: string[]): CliOptions {
  const tokens = argv.filter((token) => token !== "--");
  const values = new Map<string, string>();
  let mode: CliOptions["mode"] | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (token === "--now") {
      mode = "now";
      continue;
    }
    if (token === "--due") {
      mode = "due";
      continue;
    }
    if (!token.startsWith("--")) throw new Error(`Unexpected argument "${token}"`);
    const next = tokens[i + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`Missing value for ${token}`);
    values.set(token.slice(2), next);
    i++;
  }

  if (mode === null) throw new Error("provide --now (with --submission) or --due");
  const submissionId = values.get("submission");
  if (mode === "now" && !submissionId) throw new Error("--now requires --submission <id>");
  return { mode, submissionId };
}

/** The unattended system actor for scheduled runs (privileged, branch-unscoped). */
const SYSTEM_ACTOR: Actor = { id: "system:pipeline", role: ROLES.SUPER_ADMIN, branchId: null };

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.mode === "now") {
    const result = await runSubmissionPipeline(SYSTEM_ACTOR, opts.submissionId!, {
      trigger: "manual",
    });
    console.log(`Pipeline run ${result.runId}: ${result.status}`);
    process.exitCode = result.status === "COMPLETED" ? 0 : 1;
    return;
  }

  const summary = await runDueSchedules(SYSTEM_ACTOR);
  if (summary.length === 0) {
    console.log("No due schedules.");
    return;
  }
  for (const entry of summary) {
    console.log(`Schedule ${entry.scheduleId}: ${entry.status}`);
  }
  process.exitCode = summary.some((entry) => entry.status === "FAILED") ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error("Audit pipeline run failed:", error);
  process.exitCode = 1;
});
