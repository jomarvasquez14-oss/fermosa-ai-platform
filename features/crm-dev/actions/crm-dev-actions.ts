"use server";

import { requirePermission } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import {
  getCRMConnector,
  type FindPatientsQuery,
  type FindPatientsResult,
  type NormalizedCrmPatientRecord,
} from "@/services/crm";

/**
 * CRM Dev tooling actions (Sprint 3.4) — Super Admin only. Everything goes
 * through the CRMConnector seam; this page must keep working unchanged when
 * the browser-automation connector replaces the mock.
 */

export type CrmDevResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export async function findPatientsAction(
  query: FindPatientsQuery
): Promise<CrmDevResult<FindPatientsResult>> {
  try {
    await requirePermission("playground:access");
    const result = await getCRMConnector().findPatients(query);
    return { ok: true, data: result };
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message, code: error.code };
    return { ok: false, error: "Patient search failed unexpectedly. Check server logs." };
  }
}

export async function fetchPatientRecordAction(
  crmId: string,
  window?: { from: string; to: string }
): Promise<CrmDevResult<NormalizedCrmPatientRecord>> {
  try {
    await requirePermission("playground:access");
    const record = await getCRMConnector().fetchPatientRecord(crmId, window);
    return { ok: true, data: record };
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message, code: error.code };
    return { ok: false, error: "Record retrieval failed unexpectedly. Check server logs." };
  }
}
