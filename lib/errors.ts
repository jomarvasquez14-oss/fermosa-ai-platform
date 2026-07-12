/**
 * Application error taxonomy.
 *
 * Throw subclasses of `AppError` from services and server actions so callers
 * can distinguish expected failures from genuine bugs. Keep this file
 * dependency-free — it is imported from every layer.
 */

export class AppError extends Error {
  /** Stable, machine-readable code (e.g. "NOT_IMPLEMENTED", "CONFIGURATION"). */
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

/**
 * Thrown by architecture-only seams (AI providers, CRM connectors, audit
 * pipeline) until their implementations land in a later milestone. Callers
 * hitting this in production indicate a wiring bug, not a user error.
 */
export class NotImplementedError extends AppError {
  constructor(capability: string, plannedMilestone?: string) {
    super(
      "NOT_IMPLEMENTED",
      plannedMilestone
        ? `${capability} is not implemented yet (planned: ${plannedMilestone}).`
        : `${capability} is not implemented yet.`
    );
  }
}

/** Invalid or missing environment/configuration detected at startup or first use. */
export class ConfigurationError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super("CONFIGURATION", message, options);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
