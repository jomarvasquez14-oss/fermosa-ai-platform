import "server-only";
import { getServerEnv } from "@/lib/config/env";
import { NotImplementedError } from "@/lib/errors";
import type { CRMConnector } from "@/services/crm/crm-connector";
import type { CRMConnectorKind } from "@/services/crm/types";

export type { CRMConnector } from "@/services/crm/crm-connector";
export * from "@/services/crm/types";

/**
 * CRM connector factory — the single place a strategy is chosen.
 *
 * Selection order: explicit argument > `CRM_CONNECTOR` env var > "mock".
 * When implementations land (browser automation first, Milestone 2+), each
 * case returns its connector; until then every path throws
 * `NotImplementedError` so accidental use fails loudly.
 */
export function getCRMConnector(kind?: CRMConnectorKind): CRMConnector {
  const selected = kind ?? getServerEnv().CRM_CONNECTOR;

  switch (selected) {
    case "browser-automation":
      // return new BrowserAutomationConnector()  — Milestone 2+
      throw new NotImplementedError(`CRM connector "${selected}"`, "Milestone 2+");
    case "api":
      throw new NotImplementedError(`CRM connector "${selected}"`, "future milestone");
    case "mock":
      // return new MockCRMConnector()  — lands with the first consumer's tests
      throw new NotImplementedError(`CRM connector "${selected}"`, "Milestone 2");
  }
}
