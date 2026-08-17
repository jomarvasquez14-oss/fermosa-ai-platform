import { isAppError } from "@/lib/errors";
import {
  browserError,
  type FailurePolicy,
  type NavigationPolicy,
  type RetryPolicy,
  type TimeoutPolicy,
} from "@/services/browser/types";

/**
 * Policy execution helpers (ADR-031). The policy OBJECTS live in types/;
 * this module applies them. Classification lives in `DEFAULT_FAILURE_POLICY`
 * so "what retries" is data, not scattered catch blocks (CRM_DISCOVERY §5):
 * never retry captchas, permissions, or layout drift; retry only transport
 * failures (timeout, unavailable, crash).
 */

export const DEFAULT_FAILURE_POLICY: FailurePolicy = {
  nonRetryable: new Set(["CRM_FORBIDDEN", "CRM_CHALLENGE", "CRM_LAYOUT"]),
};

export function isRetryableFailure(
  error: unknown,
  policy: FailurePolicy = DEFAULT_FAILURE_POLICY
): boolean {
  return !(isAppError(error) && policy.nonRetryable.has(error.code));
}

/** Retry transient failures with a fixed delay, honoring the failure policy. */
export async function withRetry<T>(
  policy: RetryPolicy,
  operation: (attempt: number) => Promise<T>,
  failurePolicy: FailurePolicy = DEFAULT_FAILURE_POLICY
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (!isRetryableFailure(error, failurePolicy)) throw error;
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

/** Jittered politeness pause between page loads (CRM_DISCOVERY §5). */
export async function politenessDelay(policy: NavigationPolicy): Promise<void> {
  const { min, max } = policy.politenessDelayMs;
  if (max <= 0) return;
  const ms = min + Math.random() * Math.max(0, max - min);
  await new Promise((resolve) => setTimeout(resolve, ms));
}
