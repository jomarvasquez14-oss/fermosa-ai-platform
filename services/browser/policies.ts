import { isAppError } from "@/lib/errors";
import { browserError, type RetryPolicy, type TimeoutPolicy } from "./types";

/** Retry/timeout execution helpers (Sprint 3.9). */

const NON_RETRYABLE = new Set(["CRM_FORBIDDEN", "CRM_CHALLENGE", "CRM_LAYOUT"]);

/**
 * Retry transient failures (network, timeout) with a fixed delay; never retry
 * configuration or human-required failures (forbidden, captcha, layout —
 * same HTML twice gives the same failure, CRM_DISCOVERY §5).
 */
export async function withRetry<T>(
  policy: RetryPolicy,
  operation: (attempt: number) => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (isAppError(error) && NON_RETRYABLE.has(error.code)) throw error;
      if (attempt < policy.maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, policy.delayMs));
      }
    }
  }
  throw lastError;
}

/** Bound an operation by a timeout, mapping expiry to CRM_TIMEOUT. */
export async function withTimeout<T>(ms: number, what: string, operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(browserError("CRM_TIMEOUT", `${what} did not finish within ${ms} ms.`)),
          ms
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function navigationTimeout(policy: TimeoutPolicy): number {
  return policy.navigationMs;
}
