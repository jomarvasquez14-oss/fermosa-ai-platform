import "server-only";
import { NotImplementedError } from "@/lib/errors";
import type { AuditService } from "@/services/audit/audit-service";

export type { AuditService } from "@/services/audit/audit-service";
export * from "@/services/audit/types";

/**
 * Audit service factory. The Milestone 2 engine replaces the throw; the
 * signature is stable so no caller changes when it does.
 */
export function getAuditService(): AuditService {
  // return new AuditEngine({ ai: getAIProvider(), crm: getCRMConnector(), events: appEvents })
  throw new NotImplementedError("Audit engine", "Milestone 2");
}
