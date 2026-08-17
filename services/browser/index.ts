/**
 * Browser automation framework (ADR-031, real driver per ADR-033).
 * Layout:
 *   types/       contracts: page ids, credentials, policies, typed errors
 *   driver/      the BrowserDriver interface — the ONLY browser surface
 *   drivers/     implementations: playwright/ (real), mock/ (simulation)
 *   selectors/   versioned selector maps + registry (v1 = real captures)
 *   pages/       page objects: behavior only, selectors from the registry
 *   session/     login lifecycle, expiry recovery, idle re-verification
 *   navigation/  navigate → wait → verify → recover
 *   policies/    retry/timeout/politeness execution helpers
 *   utils/       scraped-text parsing (money, dates, header maps)
 *
 * Playwright itself is imported ONLY inside drivers/playwright/ — nothing
 * above the driver seam may name it (PROJECT_RULES #20/#24).
 */
export * from "./types";
export type {
  BrowserDriver,
  BrowserLocator,
  DownloadResult,
  TableCell,
  TableCellLink,
  TableData,
  WaitForOptions,
  WaitState,
} from "./driver/browser-driver";
export { SelectorRegistry, SELECTOR_MAP_V1 } from "./selectors";
export type { PageSelectors, SelectorMap } from "./selectors";
export {
  DEFAULT_FAILURE_POLICY,
  isRetryableFailure,
  navigationTimeout,
  politenessDelay,
  withRetry,
  withTimeout,
} from "./policies";
export * from "./pages";
export { BrowserSession, BrowserSessionManager } from "./session/session-manager";
export { NavigationManager } from "./navigation/navigation-manager";
export { BrowserManager } from "./browser-manager";
export { MockBrowserDriver, inputCell, selectCell, textCell } from "./drivers/mock/mock-driver";
export {
  PlaywrightBrowserDriver,
  type PlaywrightDriverOptions,
} from "./drivers/playwright/playwright-driver";
export {
  headerIndexMap,
  normalizeText,
  parseMoney,
  parsePackageTitle,
  toIsoDate,
  toIsoDateTime,
} from "./utils/parse";
