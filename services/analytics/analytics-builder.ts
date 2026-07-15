import type { NormalizedCrmPatientRecord } from "@/services/crm/types";
import type { AnalyticsDatum, AnalyticsModel, BranchComparisonRow } from "./types";

/**
 * Pure analytics builder (M0055). Deterministic aggregation over stored
 * snapshot records — no Prisma, no Date.now, no I/O. Same records in → same
 * model out. Money is summed as numbers and reported as 2-dp decimal strings
 * (the record already normalizes amounts to decimal strings).
 */

type Treatment = NormalizedCrmPatientRecord["treatments"][number];
type Activity = NormalizedCrmPatientRecord["activity"][number];

const TOP_N = 10;

function parseMoney(value: string): number {
  const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Sorted [{label,value}] from a count map; ties broken by label for stability. */
function topFromCounts(counts: Map<string, number>, limit = TOP_N): AnalyticsDatum[] {
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
    .slice(0, limit);
}

function bump(counts: Map<string, number>, key: string, by = 1): void {
  counts.set(key, (counts.get(key) ?? 0) + by);
}

function editTarget(event: Activity): string {
  const haystack = `${event.logName} ${event.description}`.toLowerCase();
  if (haystack.includes("payment")) return "payment";
  if (haystack.includes("invoice")) return "invoice";
  if (haystack.includes("treatment") || haystack.includes("session")) return "treatment";
  if (haystack.includes("user")) return "user";
  if (haystack.includes("package")) return "package";
  return "other";
}

function branchName(treatment: Treatment): string {
  return treatment.branch.name || treatment.branch.crmBranchId || "Unknown";
}

export function buildAnalytics(records: NormalizedCrmPatientRecord[]): AnalyticsModel {
  const distinctPatients = new Set(records.map((r) => r.patient.crmId));

  const branchTreatments = new Map<string, number>();
  const branchPatients = new Map<string, Set<string>>();
  const procedureCounts = new Map<string, number>();
  const staffCounts = new Map<string, number>();
  const roleCounts = new Map<string, number>();
  const revenueByMonth = new Map<string, number>();
  const editByTarget = new Map<string, number>();

  // Package completion: keyed by patient + packageName → sessions seen + max total.
  const packages = new Map<string, { seen: number; total: number | null }>();

  let totalRevenue = 0;

  for (const record of records) {
    for (const treatment of record.treatments) {
      const branch = branchName(treatment);
      bump(branchTreatments, branch);
      const set = branchPatients.get(branch) ?? new Set<string>();
      set.add(record.patient.crmId);
      branchPatients.set(branch, set);

      bump(procedureCounts, treatment.procedure || "Unknown");
      bump(staffCounts, treatment.performedBy.name || "Unknown");
      bump(roleCounts, treatment.performedBy.role);

      if (treatment.packageName) {
        const key = `${record.patient.crmId}::${treatment.packageName}`;
        const entry = packages.get(key) ?? { seen: 0, total: null };
        entry.seen += 1;
        if (treatment.sessionsTotal != null) {
          entry.total = Math.max(entry.total ?? 0, treatment.sessionsTotal);
        }
        packages.set(key, entry);
      }
    }

    for (const invoice of record.invoices) {
      const paid = parseMoney(invoice.amountPaid);
      totalRevenue += paid;
      bump(revenueByMonth, monthOf(invoice.dateUpdated), paid);
    }

    for (const event of record.activity) {
      bump(editByTarget, editTarget(event));
    }
  }

  // Package completion roll-up.
  let completed = 0;
  let inProgress = 0;
  const percents: number[] = [];
  for (const { seen, total } of packages.values()) {
    if (total && total > 0) {
      const percent = Math.min(100, Math.round((seen / total) * 100));
      percents.push(percent);
      if (seen >= total) completed += 1;
      else inProgress += 1;
    } else {
      inProgress += 1;
    }
  }
  const averagePercent =
    percents.length > 0
      ? Math.round((percents.reduce((sum, p) => sum + p, 0) / percents.length) * 10) / 10
      : null;

  const revenueTrends: AnalyticsDatum[] = [...revenueByMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));

  const branchComparison: BranchComparisonRow[] = [...branchTreatments.entries()]
    .map(([branch, treatments]) => ({
      branch,
      treatments,
      patients: branchPatients.get(branch)?.size ?? 0,
    }))
    .sort((a, b) => b.treatments - a.treatments || (a.branch < b.branch ? -1 : 1));

  return {
    snapshotCount: records.length,
    patientCount: distinctPatients.size,
    topBranches: topFromCounts(branchTreatments),
    treatmentFrequency: topFromCounts(procedureCounts),
    revenueTrends,
    totalRevenuePaid: totalRevenue.toFixed(2),
    packageCompletion: { packages: packages.size, completed, inProgress, averagePercent },
    staffActivity: topFromCounts(staffCounts),
    staffByRole: topFromCounts(roleCounts, 10),
    editActivityByTarget: topFromCounts(editByTarget, 10),
    branchComparison,
  };
}
