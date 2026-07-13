import "server-only";
import { getAuditOrchestrator } from "@/services/orchestrator";
import type { AuditService } from "@/services/audit/audit-service";

export type { AuditService } from "@/services/audit/audit-service";
export * from "@/services/audit/types";

/**
 * Audit service factory — since Sprint 3.6 (ADR-029) the audit engine is the
 * orchestrator. The signature never changed; callers written against the
 * seam in M1.1 work unmodified.
 */
export function getAuditService(): AuditService {
  return getAuditOrchestrator();
}
