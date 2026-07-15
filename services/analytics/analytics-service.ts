import "server-only";
import { prisma } from "@/lib/db/prisma";
import { validateSnapshotRecord } from "@/services/crm/snapshot";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";
import { buildAnalytics } from "./analytics-builder";
import type { AnalyticsModel } from "./types";

/**
 * Analytics persistence (M0055). Reads STORED evidence snapshot records
 * (`AuditEvidenceSnapshot.record`) — never the live CRM — validates each
 * against the schema (a corrupt record is skipped loudly, not silently
 * trusted), and hands the set to the pure builder. Bounded to the most recent
 * snapshots so a large history does not load unboundedly.
 */

const MAX_SNAPSHOTS = 5000;

export async function getAnalytics(limit = MAX_SNAPSHOTS): Promise<AnalyticsModel> {
  const rows = await prisma.auditEvidenceSnapshot.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, record: true },
  });

  const records: NormalizedCrmPatientRecord[] = [];
  for (const row of rows) {
    try {
      records.push(validateSnapshotRecord(row.record));
    } catch (error) {
      // A corrupt stored record must not poison the whole view — skip it and
      // say so, rather than trusting malformed evidence.
      console.error(`analytics: skipping invalid snapshot ${row.id}:`, error);
    }
  }

  return buildAnalytics(records);
}
