import type {
  CRMConnectorKind,
  CRMHealth,
  CRMQuery,
  CRMRequestOptions,
  CustomerRecord,
} from "@/services/crm/types";

/**
 * CRM connector interface — the Strategy seam for CRM access.
 *
 * The rest of the application depends ONLY on this interface and obtains an
 * instance from the factory in `services/crm/index.ts`; which strategy is
 * active (browser automation, direct API, mock) is configuration, invisible
 * to every caller. Nothing outside `services/crm/` may know or branch on the
 * connector kind.
 *
 * Implementations must:
 *  - normalize source-system fields into `CustomerRecord` — no leaking raw
 *    CRM field names or DOM artifacts,
 *  - surface failures as `AppError` subclasses (timeouts, auth expiry, ...),
 *  - treat the source system as read-only until a milestone says otherwise.
 */
export interface CRMConnector {
  readonly kind: CRMConnectorKind;

  /** Cheap connectivity/login probe for dashboards and pre-flight checks. */
  healthCheck(options?: CRMRequestOptions): Promise<CRMHealth>;

  /** Fetch customer records matching a query. */
  fetchCustomerRecords(query: CRMQuery, options?: CRMRequestOptions): Promise<CustomerRecord[]>;

  /** Fetch a single record by its source-system identifier. */
  fetchRecordById(externalId: string, options?: CRMRequestOptions): Promise<CustomerRecord | null>;
}
