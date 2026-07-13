import { AppError, NotFoundError } from "@/lib/errors";
import type { CRMConnector } from "@/services/crm/crm-connector";
import {
  normalizedCrmPatientRecordSchema,
  type CRMHealth,
  type FindPatientsQuery,
  type FindPatientsResult,
  type NormalizedCrmPatientRecord,
  type PatientSummary,
  type RetrievalWindow,
} from "@/services/crm/types";
import { ERROR_TRIGGERS, FIXTURE_RECORDS, FIXTURES_VERSION } from "./fixtures";

/**
 * Mock CRM connector (Sprint 3.4) — the first CRMConnector implementation.
 *
 * Deterministic fixture data shaped like the real CRM (CRM_DISCOVERY §1), so
 * the matching engine, review UIs, and tests develop without touching the
 * live system. Business outcomes are data; reserved `trigger:*` names in
 * `query.name` simulate infrastructure failures (see fixtures.ts).
 */

const norm = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
const digits = (value: string) => value.replace(/\D/g, "");

function toSummary(record: (typeof FIXTURE_RECORDS)[number]): PatientSummary {
  const { patient } = record;
  return {
    crmId: patient.crmId,
    fullName: patient.fullName,
    dateOfBirth: patient.dateOfBirth,
    mobileNo: patient.mobileNo,
    membershipType: patient.membershipType,
    lastVisit: patient.lastVisit,
  };
}

function inWindow(dateIso: string, window?: RetrievalWindow): boolean {
  if (!window) return true;
  const day = dateIso.slice(0, 10);
  return day >= window.from && day <= window.to;
}

export class MockCRMConnector implements CRMConnector {
  readonly kind = "mock" as const;

  async healthCheck(): Promise<CRMHealth> {
    return { ok: true, detail: `mock connector (${FIXTURES_VERSION})`, checkedAt: new Date() };
  }

  async findPatients(query: FindPatientsQuery): Promise<FindPatientsResult> {
    const trigger = ERROR_TRIGGERS[query.name as keyof typeof ERROR_TRIGGERS];
    if (trigger) {
      throw new AppError(
        trigger,
        trigger === "CRM_UNAVAILABLE"
          ? "The CRM is unreachable right now. The comparison will be retried."
          : trigger === "CRM_FORBIDDEN"
            ? "The CRM account lacks access to patient search. Check the service account's permissions."
            : "The CRM page layout does not match the expected structure. The selector map likely needs an update."
      );
    }

    const hasCriteria = Boolean(
      query.crmId ||
      query.name ||
      query.firstName ||
      query.lastName ||
      query.dob ||
      query.mobileNo ||
      query.email
    );
    if (!hasCriteria) return { outcome: "not-found", candidates: [] };

    const matches = FIXTURE_RECORDS.filter(({ patient }) => {
      if (query.crmId) return patient.crmId === query.crmId;
      if (query.dob && patient.dateOfBirth !== query.dob) return false;
      if (query.mobileNo && digits(patient.mobileNo ?? "") !== digits(query.mobileNo)) return false;
      if (query.email && norm(patient.email ?? "") !== norm(query.email)) return false;
      if (query.name) {
        const haystack = norm(`${patient.fullName} ${patient.firstName} ${patient.lastName}`);
        if (!haystack.includes(norm(query.name))) return false;
      }
      if (query.firstName && !norm(patient.firstName ?? "").includes(norm(query.firstName))) {
        return false;
      }
      if (query.lastName && !norm(patient.lastName ?? "").includes(norm(query.lastName))) {
        return false;
      }
      return true;
    });

    if (matches.length === 0) return { outcome: "not-found", candidates: [] };
    if (matches.length === 1) return { outcome: "found", candidates: [toSummary(matches[0]!)] };
    // Never auto-pick between candidates (CRM_DISCOVERY §6).
    return { outcome: "ambiguous", candidates: matches.map(toSummary) };
  }

  async fetchPatientRecord(
    crmId: string,
    window?: RetrievalWindow
  ): Promise<NormalizedCrmPatientRecord> {
    const fixture = FIXTURE_RECORDS.find((record) => record.patient.crmId === crmId);
    if (!fixture) throw new NotFoundError("CRM patient");

    const record: NormalizedCrmPatientRecord = {
      ...structuredClone(fixture),
      retrievedAt: new Date().toISOString(),
      connectorKind: this.kind,
      treatments: fixture.treatments.filter((t) => inWindow(t.performedAt, window)),
      invoices: fixture.invoices.filter((i) => inWindow(i.dateUpdated, window)),
      activity: fixture.activity.filter((a) => inWindow(a.occurredAt, window)),
    };

    // Boundary guarantee: connectors emit only schema-valid records.
    return normalizedCrmPatientRecordSchema.parse(record);
  }
}
