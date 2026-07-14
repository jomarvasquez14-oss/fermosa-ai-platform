import "server-only";
import { getServerEnv } from "@/lib/config/env";
import { NotImplementedError } from "@/lib/errors";
import type { CRMConnector } from "@/services/crm/crm-connector";
import { MockCRMConnector } from "@/services/crm/connectors/mock/mock-crm-connector";
import { PlaywrightCRMConnector } from "@/services/crm/connectors/playwright/playwright-crm-connector";
import type { CRMConnectorKind } from "@/services/crm/types";

export type { CRMConnector } from "@/services/crm/crm-connector";
export * from "@/services/crm/types";

const instances = new Map<CRMConnectorKind, CRMConnector>();

/**
 * CRM connector factory — the single place a strategy is chosen.
 *
 * Selection order: explicit argument > `CRM_CONNECTOR` env var > "mock".
 * Implemented: mock (3.4), browser-automation via Playwright (ADR-033;
 * `CRM_CONNECTOR=playwright` is an accepted alias). API when the CRM
 * exposes one. Unimplemented selections throw `NotImplementedError` so
 * accidental use fails loudly.
 */
export function getCRMConnector(kind?: CRMConnectorKind): CRMConnector {
  const configured = kind ?? getServerEnv().CRM_CONNECTOR;
  const selected: CRMConnectorKind =
    configured === "playwright" ? "browser-automation" : configured;
  const cached = instances.get(selected);
  if (cached) return cached;

  let connector: CRMConnector;
  switch (selected) {
    case "mock":
      connector = new MockCRMConnector();
      break;
    case "browser-automation":
      connector = new PlaywrightCRMConnector();
      break;
    case "api":
      throw new NotImplementedError(`CRM connector "${selected}"`, "future milestone");
  }

  instances.set(selected, connector);
  return connector;
}
