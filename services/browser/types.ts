import { AppError } from "@/lib/errors";

/**
 * Browser automation framework contracts (Sprint 3.9, ADR-031).
 * FRAMEWORK ONLY — no live CRM, no Playwright dependency. The real driver
 * implements `BrowserDriver` later; everything above it never changes.
 */

/** The CRM pages the framework knows how to operate (CRM_DISCOVERY §4). */
export const PAGE_IDS = [
  "login",
  "dashboard",
  "patient-search",
  "patient-profile",
  "invoice",
  "activity-log",
] as const;
export type PageId = (typeof PAGE_IDS)[number];

/**
 * The ONLY surface a real browser must implement (Playwright adapter later,
 * mock today). Deliberately tiny: navigation + element ops + observation.
 */
export interface BrowserDriver {
  goto(url: string): Promise<void>;
  currentUrl(): Promise<string>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  readText(selector: string): Promise<string | null>;
  isVisible(selector: string): Promise<boolean>;
  close(): Promise<void>;
}

export type SessionStatus = "disconnected" | "authenticated" | "expired";

export interface BrowserCredentials {
  username: string;
  password: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  delayMs: number;
}

export interface TimeoutPolicy {
  navigationMs: number;
  actionMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 3, delayMs: 50 };
export const DEFAULT_TIMEOUT_POLICY: TimeoutPolicy = { navigationMs: 30_000, actionMs: 10_000 };

/**
 * Error taxonomy (CRM_DISCOVERY §6). One constructor so every failure carries
 * a typed code the orchestrator and UIs can branch on.
 */
export type BrowserErrorCode =
  | "CRM_TIMEOUT"
  | "CRM_LAYOUT"
  | "CRM_FORBIDDEN"
  | "CRM_SESSION"
  | "CRM_CHALLENGE"
  | "CRM_UNAVAILABLE";

export function browserError(code: BrowserErrorCode, message: string): AppError {
  return new AppError(code, message);
}
