/**
 * CRM layer contracts — connector-independent types.
 * Architecture only (Milestone 1.1): no connector implementations exist yet.
 */

/**
 * Available connector strategies:
 *  - "browser-automation" — drives the legacy CRM's web UI (first real connector)
 *  - "api"                — direct CRM API integration (future)
 *  - "mock"               — deterministic fixture data for tests/local dev
 */
export const CRM_CONNECTOR_KINDS = ["browser-automation", "api", "mock"] as const;
export type CRMConnectorKind = (typeof CRM_CONNECTOR_KINDS)[number];

/**
 * A customer record as the platform sees it. Connectors translate whatever
 * their source system returns into this shape — CRM-specific field names must
 * never leak past the connector boundary.
 */
export interface CustomerRecord {
  /** Identifier in the source CRM system. */
  externalId: string;
  displayName: string;
  /** Source fields, normalized to string key/values until M2 fixes the schema. */
  fields: Record<string, string>;
  /** When the connector actually read this from the source system. */
  retrievedAt: Date;
}

export interface CRMQuery {
  branchCode?: string;
  customerName?: string;
  externalId?: string;
  /** Inclusive date range filter on the source system's record date. */
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}

export interface CRMHealth {
  ok: boolean;
  /** Human-readable detail (login state, API reachability, ...). */
  detail?: string;
  checkedAt: Date;
}

export interface CRMRequestOptions {
  /** Correlates connector calls with audit sessions / event streams. */
  correlationId?: string;
  signal?: AbortSignal;
}
