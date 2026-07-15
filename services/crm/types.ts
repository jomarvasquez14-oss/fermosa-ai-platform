import { z } from "zod";

/**
 * CRM layer contracts — connector-independent types.
 * Contract per docs/CRM_DISCOVERY.md §3/§7 (ADR-027), implemented first by the
 * mock connector (Sprint 3.4). Dates travel as ISO strings and money as
 * decimal strings: records are serializable snapshots by design.
 */

/**
 * Available connector strategies:
 *  - "mock"               — deterministic fixture data (shipped, Sprint 3.4)
 *  - "browser-automation" — drives the CRM's web UI (Sprint 3 implementation)
 *  - "api"                — direct CRM API integration (future)
 */
export const CRM_CONNECTOR_KINDS = ["mock", "browser-automation", "api"] as const;
export type CRMConnectorKind = (typeof CRM_CONNECTOR_KINDS)[number];

// ---------------------------------------------------------------------------
// Patient lookup
// ---------------------------------------------------------------------------

/** Multi-identifier search — mirrors the CRM's own search form fields. */
export interface FindPatientsQuery {
  name?: string;
  firstName?: string;
  lastName?: string;
  /** yyyy-mm-dd */
  dob?: string;
  mobileNo?: string;
  email?: string;
  crmId?: string;
}

export const patientSummarySchema = z.object({
  crmId: z.string(),
  fullName: z.string(),
  dateOfBirth: z.string().nullable(),
  mobileNo: z.string().nullable(),
  membershipType: z.string().nullable(),
  lastVisit: z.string().nullable(),
});
export type PatientSummary = z.infer<typeof patientSummarySchema>;

/**
 * Lookup outcomes are DATA, not exceptions (CRM_DISCOVERY §6): `ambiguous`
 * carries candidates and is never auto-resolved by the connector.
 */
export interface FindPatientsResult {
  outcome: "found" | "not-found" | "ambiguous";
  /** Exactly one when found; 2+ when ambiguous; empty when not-found. */
  candidates: PatientSummary[];
}

/**
 * One page of a patient ENUMERATION (ADR-037) — a deliberate listing for
 * dataset sweeps, distinct from `findPatients` (a search). No ambiguity
 * semantics apply: this is "list everyone, a page at a time". The caller
 * drives pagination under its own page budget; a connector never crawls the
 * whole clinic in a single call.
 */
export interface PatientPage {
  patients: PatientSummary[];
  /** 1-based page index, echoed back for provenance. */
  page: number;
  hasNextPage: boolean;
}

// ---------------------------------------------------------------------------
// Normalized record (CRM_DISCOVERY §3) — the ONLY shape consumers ever see
// ---------------------------------------------------------------------------

export const normalizedCrmPatientRecordSchema = z.object({
  // provenance — every consumer can ask "when and how was this true?"
  retrievedAt: z.string(),
  connectorKind: z.enum(CRM_CONNECTOR_KINDS),
  sourceRef: z.string(),

  patient: z.object({
    crmId: z.string(),
    fullName: z.string(),
    firstName: z.string().nullable(),
    middleName: z.string().nullable(),
    lastName: z.string().nullable(),
    nickname: z.string().nullable(),
    dateOfBirth: z.string().nullable(),
    email: z.string().nullable(),
    mobileNo: z.string().nullable(),
    membershipType: z.string().nullable(),
    lastVisit: z.string().nullable(),
  }),

  treatments: z.array(
    z.object({
      performedAt: z.string(),
      branch: z.object({
        crmBranchId: z.string(),
        name: z.string(),
        platformBranchId: z.string().nullable(),
      }),
      procedure: z.string(),
      packageName: z.string().nullable(),
      sessionNumber: z.number().int().nullable(),
      sessionsTotal: z.number().int().nullable(),
      promoCode: z.string().nullable(),
      intensitySettings: z.string().nullable(),
      performedBy: z.object({
        name: z.string(),
        role: z.enum(["aesthetician", "encoder", "unknown"]),
      }),
      locked: z.boolean(),
    })
  ),

  invoices: z.array(
    z.object({
      refNo: z.string(),
      serviceName: z.string(),
      amount: z.string(),
      amountPaid: z.string(),
      balance: z.string(),
      status: z.string(),
      dateUpdated: z.string(),
      payments: z
        .array(
          z.object({
            paidAt: z.string(),
            amount: z.string(),
            mode: z.string(),
            receivedBy: z.string(),
            referenceNo: z.string().nullable(),
            // Additive, OPTIONAL (ADR-039, M0056): completed |
            // cancellation-requested | cancelled. Optional so evidence
            // snapshots sealed before M0056 (no per-payment status) still
            // validate on load. Absent ⇒ status was not captured.
            status: z.string().optional(),
          })
        )
        .nullable(),
    })
  ),

  activity: z.array(
    z.object({
      occurredAt: z.string(),
      logName: z.string(),
      description: z.string(),
      causedBy: z.string(),
      changes: z
        .array(
          z.object({
            field: z.string(),
            oldValue: z.string().nullable(),
            newValue: z.string().nullable(),
          })
        )
        .nullable(),
    })
  ),
});
export type NormalizedCrmPatientRecord = z.infer<typeof normalizedCrmPatientRecordSchema>;

/** Inclusive date window for treatments/invoices/activity retrieval. */
export interface RetrievalWindow {
  /** yyyy-mm-dd */
  from: string;
  /** yyyy-mm-dd */
  to: string;
}

export interface CRMHealth {
  ok: boolean;
  /** Human-readable detail (login state, fixture version, ...). */
  detail?: string;
  checkedAt: Date;
}

export interface CRMRequestOptions {
  /** Correlates connector calls with audit sessions / event streams. */
  correlationId?: string;
  signal?: AbortSignal;
}
