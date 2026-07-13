/**
 * Browser automation framework (Sprint 3.9, ADR-031) — FRAMEWORK ONLY.
 * No Playwright dependency, no live-CRM contact: the mock driver is the only
 * implementation until CRM integration is sanctioned (service account, login
 * capture — CRM_DISCOVERY §8). The future real driver implements
 * `BrowserDriver`; nothing above it changes.
 */
export * from "./types";
export { SelectorRegistry, SELECTOR_MAP_V1 } from "./selector-registry";
export { withRetry, withTimeout } from "./policies";
export { BasePage } from "./base-page";
export * from "./pages";
export { BrowserSession } from "./session";
export { NavigationManager } from "./navigation-manager";
export { BrowserManager } from "./browser-manager";
export { MockBrowserDriver } from "./drivers/mock-driver";
