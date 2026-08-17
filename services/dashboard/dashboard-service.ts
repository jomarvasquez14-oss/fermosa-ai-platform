import "server-only";
import type { Prisma } from "@prisma/client";
import { ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import type { Actor } from "@/services/audit-submission-service";
import {
  buildAdminDashboard,
  buildAuditorDashboard,
  buildBranchDashboard,
} from "./dashboard-builder";
import type {
  AuditorDashboard,
  BranchDashboard,
  DashboardFindingRow,
  DashboardInput,
  DashboardSubmissionRow,
} from "./types";

/**
 * Dashboard persistence + role routing (M0053). Reads only rows already at
 * rest (submissions, findings, branches) — REAL data, never the live CRM and
 * never fabricated numbers — then hands them to the pure builders. Branch
 * Managers see only their own branch; Auditors and Super-Admins see all.
 */

function branchScopeSubmission(actor: Actor): Prisma.AuditSubmissionWhereInput {
  return actor.role === ROLES.BRANCH_MANAGER ? { branchId: actor.branchId ?? "__none__" } : {};
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function loadInput(actor: Actor): Promise<DashboardInput> {
  const where = branchScopeSubmission(actor);

  const [submissions, branches] = await Promise.all([
    prisma.auditSubmission.findMany({
      where,
      select: {
        id: true,
        branchId: true,
        status: true,
        auditDate: true,
        submittedAt: true,
        completedAt: true,
        createdAt: true,
        branch: { select: { name: true } },
      },
    }),
    actor.role === ROLES.BRANCH_MANAGER
      ? prisma.branch.findMany({
          where: { id: actor.branchId ?? "__none__" },
          select: { id: true, name: true },
        })
      : prisma.branch.findMany({ select: { id: true, name: true } }),
  ]);

  const submissionRows: DashboardSubmissionRow[] = submissions.map((s) => ({
    id: s.id,
    branchId: s.branchId,
    branchName: s.branch.name,
    status: s.status,
    auditDate: s.auditDate.toISOString().slice(0, 10),
    submittedAt: iso(s.submittedAt),
    completedAt: iso(s.completedAt),
    createdAt: s.createdAt.toISOString(),
  }));

  // Findings are scoped through their submission's branch (findings have no
  // branchId column) — restrict to the submissions we just loaded.
  const submissionIds = submissionRows.map((s) => s.id);
  const branchBySubmission = new Map(submissionRows.map((s) => [s.id, s.branchId]));
  const findings =
    submissionIds.length === 0
      ? []
      : await prisma.auditFinding.findMany({
          where: { submissionId: { in: submissionIds } },
          select: {
            id: true,
            submissionId: true,
            category: true,
            severity: true,
            status: true,
            createdAt: true,
            reviewedAt: true,
            resolvedAt: true,
          },
        });

  const findingRows: DashboardFindingRow[] = findings.map((f) => ({
    id: f.id,
    submissionId: f.submissionId,
    branchId: branchBySubmission.get(f.submissionId) ?? "",
    category: f.category,
    severity: f.severity,
    status: f.status,
    createdAt: f.createdAt.toISOString(),
    reviewedAt: iso(f.reviewedAt),
    resolvedAt: iso(f.resolvedAt),
  }));

  return { submissions: submissionRows, findings: findingRows, branches };
}

/**
 * The dashboard for an actor's role: Branch Managers get their branch view,
 * everyone else gets the auditor view; Super-Admins additionally get the admin
 * view via `getAdminDashboard`.
 */
export async function getDashboard(actor: Actor): Promise<AuditorDashboard | BranchDashboard> {
  const input = await loadInput(actor);
  if (actor.role === ROLES.BRANCH_MANAGER) {
    const branch = input.branches[0];
    return buildBranchDashboard(input, actor.branchId ?? "__none__", branch?.name ?? "Your branch");
  }
  return buildAuditorDashboard(input);
}

/** Admin roll-up across all branches (Super-Admin only; caller guards access). */
export async function getAdminDashboard(actor: Actor): Promise<ReturnType<typeof buildAdminDashboard>> {
  const input = await loadInput(actor);
  return buildAdminDashboard(input);
}
