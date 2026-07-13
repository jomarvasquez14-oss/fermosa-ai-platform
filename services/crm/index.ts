import "server-only";
import { getServerEnv } from "@/lib/config/env";
import { NotImplementedError } from "@/lib/errors";
import type { CRMConnector } from "@/services/crm/crm-connector";
import { MockCRMConnector } from "@/services/crm/connectors/mock/mock-crm-connector";
import type { CRMConnectorKind } from "@/services/crm/types";

export type { CRMConnector } from "@/services/crm/crm-connector";
export * from "@/services/crm/types";

const instances = new Map<CRMConnectorKind, CRMConnector>();

/**
 * CRM connector factory — the single place a strategy is chosen.
 *
 * Selection order: explicit argument > `CRM_CONNECTOR` env var > "mock".
 * Implemented: mock (3.4). Browser automation lands in Sprint 3's
 * implementation phase; API when the CRM exposes one. Unimplemented
 * selections throw `NotImplementedError` so accidental use fails loudly.
 */
export function getCRMConnector(kind?: CRMConnectorKind): CRMConnector {
  const selected = kind ?? getServerEnv().CRM_CONNECTOR;
  const cached = instances.get(selected);
  if (cached) return cached;

  let connector: CRMConnector;
  switch (selected) {
    case "mock":
      connector = new MockCRMConnector();
      break;
    case "browser-automation":
      throw new NotImplementedError(`CRM connector "${selected}"`, "Sprint 3 implementation");
    case "api":
      throw new NotImplementedError(`CRM connector "${selected}"`, "future milestone");
  }

  instances.set(selected, connector);
  return connector;
}
