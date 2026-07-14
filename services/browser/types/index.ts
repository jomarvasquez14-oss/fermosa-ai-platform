import { AppError } from "@/lib/errors";

/**
 * Browser automation framework contracts (ADR-031; extended by ADR-033).
 * The driver surface lives in `../driver/browser-driver`; this module owns
 * page identity, session/credential/policy types, and the error taxonomy.
 */

/**
 * Every CRM surface the framework knows how to operate (CRM_DISCOVERY §4).
 * "Pages" are navigable routes; tab/detail entries are sections addressed
 * through their owning page but carry their own selectors and fingerprints.
 */
export const PAGE_IDS = [
  "login",
  "dashboard",
  "patient-search",
  "patient-profile",
  "treatment-tab",
  "invoice-tab",
  "invoice",
  "invoice-detail",
  "activity-log",
] as const;
export type PageId = (typeof PAGE_IDS)[number];

/** The subset of PAGE_IDS the NavigationManager may navigate to directly. */
export const NAVIGABLE_PAGE_IDS = [
  "login",
  "dashboard",
  "patient-search",
  "patient-profile",
  "invoice",
  "activity-log",
] as const;
export type NavigablePageId = (typeof NAVIGABLE_PAGE_IDS)[number];

export type SessionStatus = "disconnected" | "authenticated" | "expired";

export interface BrowserCredentials {
  username: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Policies (CRM_DISCOVERY §5) — declarative knobs consumed by the execution
// helpers in `../policies`.
// ---------------------------------------------------------------------------

export interface RetryPolicy {
  maxAttempts: number;
  delayMs: number;
}

export interface TimeoutPolicy {
  navigationMs: number;
  actionMs: number;
  /** Idle window after which the session re-verifies auth before reuse. */
  idleMs: number;
}

/** How navigation behaves around recovery and politeness. */
export interface NavigationPolicy {
  /** Re-authentications allowed per navigation before CRM_SESSION escalates. */
  maxReconnects: number;
  /** Jittered delay between page loads — a careful clerk, not a crawler. */
  politenessDelayMs: { min: number; max: number };
}

/**
 * Which failures may be retried. Captchas, permission errors, and layout
 * drift never retry: the same HTML twice gives the same failure, and a
 * captcha retried is a captcha "attacked".
 */
export interface FailurePolicy {
  nonRetryable: ReadonlySet<string>;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 3, delayMs: 50 };
export const DEFAULT_TIMEOUT_POLICY: TimeoutPolicy = {
  navigationMs: 30_000,
  actionMs: 10_000,
  idleMs: 10 * 60_000,
};
export const DEFAULT_NAVIGATION_POLICY: NavigationPolicy = {
  maxReconnects: 1,
  // The REAL driver already pauses before every page load (politeness lives
  // where the real browser lives); this layer adds throttling only when a
  // caller raises it explicitly. Mock-driven tests stay instant.
  politenessDelayMs: { min: 0, max: 0 },
};

// ---------------------------------------------------------------------------
// Error taxonomy (CRM_DISCOVERY §6) — stable codes the orchestrator and UIs
// branch on. Named subclasses exist so intent reads at the throw site; the
// CODE is the contract, the class name is ergonomics.
// ---------------------------------------------------------------------------

export type BrowserErrorCode =
  | "CRM_TIMEOUT"
  | "CRM_LAYOUT"
  | "CRM_FORBIDDEN"
  | "CRM_SESSION"
  | "CRM_CHALLENGE"
  | "CRM_UNAVAILABLE";

export class BrowserAutomationError extends AppError {
  constructor(code: BrowserErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, options);
  }
}

/** Navigation or action exceeded its timeout budget. Retryable. */
export class NavigationTimeoutError extends BrowserAutomationError {
  constructor(message: string, options?: ErrorOptions) {
    super("CRM_TIMEOUT", message, options);
  }
}

/**
 * The page does not match the versioned selector map — a CRM redesign or a
 * stale map. Never retried, never silently continued (CRM_DISCOVERY §5).
 */
export class LayoutChangedError extends BrowserAutomationError {
  constructor(message: string, options?: ErrorOptions) {
    super("CRM_LAYOUT", message, options);
  }
}

/** Login with the configured service account was rejected. Not retryable. */
export class AuthenticationFailedError extends BrowserAutomationError {
  constructor(message: string, options?: ErrorOptions) {
    super("CRM_FORBIDDEN", message, options);
  }
}

/** The account reached the CRM but lacks access to a page (401/403). */
export class CrmForbiddenError extends BrowserAutomationError {
  constructor(message: string, options?: ErrorOptions) {
    super("CRM_FORBIDDEN", message, options);
  }
}

/** The session expired and one re-authentication did not recover it. */
export class SessionExpiredError extends BrowserAutomationError {
  constructor(message: string, options?: ErrorOptions) {
    super("CRM_SESSION", message, options);
  }
}

/** The CRM presented a CAPTCHA — a human must resolve it, never automation. */
export class CaptchaDetectedError extends BrowserAutomationError {
  constructor(message: string, options?: ErrorOptions) {
    super("CRM_CHALLENGE", message, options);
  }
}

/** The CRM is unreachable (network failure, 5xx, page crash). Retryable. */
export class CrmUnavailableError extends BrowserAutomationError {
  constructor(message: string, options?: ErrorOptions) {
    super("CRM_UNAVAILABLE", message, options);
  }
}

/** Factory kept for call sites that select the code dynamically. */
export function browserError(code: BrowserErrorCode, message: string): AppError {
  return new BrowserAutomationError(code, message);
}
