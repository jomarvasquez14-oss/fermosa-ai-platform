import type {
  CRMConnectorKind,
  CRMHealth,
  CRMRequestOptions,
  FindPatientsQuery,
  FindPatientsResult,
  NormalizedCrmPatientRecord,
  PatientPage,
  RetrievalWindow,
} from "@/services/crm/types";

/**
 * CRM connector interface — the Strategy seam for CRM access
 * (CRM_DISCOVERY.md §7, ADR-027).
 *
 * The rest of the application depends ONLY on this interface and obtains an
 * instance from the factory in `services/crm/index.ts`; which strategy is
 * active (mock, browser automation, direct API) is configuration, invisible
 * to every caller. Nothing outside `services/crm/` may know or branch on the
 * connector kind, reference a CRM page/URL/selector, or see a raw CRM field.
 *
 * Implementations must:
 *  - speak the normalized model only — `NormalizedCrmPatientRecord` out,
 *    never source-system shapes,
 *  - treat business outcomes as data (`not-found` / `ambiguous` with
 *    candidates, never auto-picked) and throw `AppError`s only for
 *    infrastructure failures (`CRM_UNAVAILABLE`, `CRM_FORBIDDEN`,
 *    `CRM_LAYOUT`, `CRM_SESSION`),
 *  - be READ-ONLY against the source system — no mutating route, ever,
 *  - stamp every record with provenance (retrievedAt, kind, sourceRef).
 */
export interface CRMConnector {
  readonly kind: CRMConnectorKind;

  /** Cheap reachability/auth probe for dashboards and pre-flight checks. */
  healthCheck(options?: CRMRequestOptions): Promise<CRMHealth>;

  /** Multi-identifier patient lookup. Ambiguity is surfaced, never resolved. */
  findPatients(query: FindPatientsQuery, options?: CRMRequestOptions): Promise<FindPatientsResult>;

  /**
   * Full normalized record for a known patient, with treatments, invoices,
   * and activity filtered to the retrieval window (omit for everything).
   */
  fetchPatientRecord(
    crmId: string,
    window?: RetrievalWindow,
    options?: CRMRequestOptions
  ): Promise<NormalizedCrmPatientRecord>;

  /**
   * OPTIONAL read-only patient enumeration for dataset sweeps (ADR-037), one
   * bounded page at a time. Distinct from `findPatients` (a search): this is
   * a deliberate listing with no ambiguity semantics. Connectors that cannot
   * or must not enumerate omit it — callers MUST handle its absence by
   * failing loudly, never silently sweeping nothing.
   */
  listPatients?(page: number, options?: CRMRequestOptions): Promise<PatientPage>;
}
