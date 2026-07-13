import "server-only";
import type { Prisma } from "@prisma/client";
import { ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import { InvalidStateError, NotFoundError } from "@/lib/errors";
import {
  canTransitionFinding,
  findingEvidenceSchema,
  type FindingDraft,
  type FindingEvidence,
  type FindingStatus,
} from "@/lib/findings";
import { logger } from "@/lib/logger";
import type { Actor } from "@/services/audit-submission-service";

/**
 * Finding persistence (Sprint 3.7) — arrives with the first real producer
 * (the rule engine), per ADR-028. Enforces:
 *  - branch scoping (Branch Managers see only their branch's findings),
 *  - the §5.5 status workflow (no skipping review; findings never deleted),
 *  - evidence validity at the write boundary.
 */

const findingInclude = {
  submission: {
    select: { id: true, auditDate: true, branch: { select: { name: true } } },
  },
} satisfies Prisma.AuditFindingInclude;

type FindingRow = Prisma.AuditFindingGetPayload<{ include: typeof findingInclude }>;

export interface FindingRecord {
  id: string;
  category: FindingRow["category"];
  severity: FindingRow["severity"];
  status: FindingStatus;
  source: FindingRow["source"];
  submissionId: string;
  branchName: string;
  auditDate: string;
  title: string;
  detail: string;
  recommendation: string | null;
  expectedValue: string | null;
  actualValue: string | null;
  evidence: FindingEvidence[];
  confidence: number | null;
  createdAt: string;
}

function toRecord(row: FindingRow): FindingRecord {
  return {
    id: row.id,
    category: row.category,
    severity: row.severity,
    status: row.status as FindingStatus,
    source: row.source,
    submissionId: row.submissionId,
    branchName: row.submission.branch.name,
    auditDate: row.submission.auditDate.toISOString().slice(0, 10),
    title: row.title,
    detail: row.detail,
    recommendation: row.recommendation,
    expectedValue: row.expectedValue,
    actualValue: row.actualValue,
    evidence: (row.evidence as FindingEvidence[]) ?? [],
    confidence: row.confidence,
    createdAt: row.createdAt.toISOString(),
  };
}

function branchScope(actor: Actor): Prisma.AuditFindingWhereInput {
  return actor.role === ROLES.BRANCH_MANAGER
    ? { submission: { branchId: actor.branchId ?? "__none__" } }
    : {};
}

export const findingService = {
  /**
   * Persist a producer's drafts for a submission. Idempotent per
   * (submission, source): if findings from this source already exist, the
   * call is a no-op — findings are never deleted, so re-runs must not
   * duplicate them. Returns how many rows exist afterwards.
   */
  async createForSubmission(
    submissionId: string,
    source: FindingRow["source"],
    drafts: FindingDraft[]
  ): Promise<{ created: number; existing: number }> {
    const existing = await prisma.auditFinding.count({ where: { submissionId, source } });
    if (existing > 0) {
      logger.info("Findings already exist for source; skipping create", {
        submissionId,
        source,
        existing,
      });
      return { created: 0, existing };
    }

    for (const draft of drafts) {
      for (const item of draft.evidence) findingEvidenceSchema.parse(item);
    }

    await prisma.auditFinding.createMany({
      data: drafts.map((draft) => ({
        submissionId,
        category: draft.category,
        severity: draft.severity,
        source,
        title: draft.title,
        detail: draft.detail,
        recommendation: draft.recommendation,
        expectedValue: draft.expectedValue,
        actualValue: draft.actualValue,
        evidence: draft.evidence as unknown as Prisma.InputJsonValue,
        confidence: draft.confidence,
      })),
    });
    return { created: drafts.length, existing: 0 };
  },

  /** Scoped listing (BM = own branch; Auditor/SA = all). */
  async list(actor: Actor): Promise<FindingRecord[]> {
    const rows = await prisma.auditFinding.findMany({
      where: branchScope(actor),
      include: findingInclude,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.map(toRecord);
  },

  async listForSubmission(actor: Actor, submissionId: string): Promise<FindingRecord[]> {
    const rows = await prisma.auditFinding.findMany({
      where: { submissionId, ...branchScope(actor) },
      include: findingInclude,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toRecord);
  },

  /** §5.5 workflow transition with timestamps; findings are never deleted. */
  async transition(
    actor: Actor,
    findingId: string,
    to: FindingStatus,
    resolution?: string
  ): Promise<FindingRecord> {
    const row = await prisma.auditFinding.findFirst({
      where: { id: findingId, ...branchScope(actor) },
      include: findingInclude,
    });
    if (!row) throw new NotFoundError("Finding");

    const from = row.status as FindingStatus;
    if (!canTransitionFinding(from, to)) {
      throw new InvalidStateError(`Illegal finding transition: ${from} → ${to}.`);
    }

    const updated = await prisma.auditFinding.update({
      where: { id: findingId },
      data: {
        status: to,
        reviewedAt: to === "REVIEWED" ? new Date() : row.reviewedAt,
        resolvedAt: to === "RESOLVED" ? new Date() : to === "OPEN" ? null : row.resolvedAt,
        resolution: to === "RESOLVED" ? (resolution ?? row.resolution) : row.resolution,
      },
      include: findingInclude,
    });
    logger.info("Finding transitioned", { findingId, from, to, actorId: actor.id });
    return toRecord(updated);
  },
};
