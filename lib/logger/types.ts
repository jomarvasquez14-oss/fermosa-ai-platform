export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogContext = Record<string, unknown>;

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
}

/**
 * A transport delivers log entries to a destination (console, file, Datadog,
 * Sentry, ...). Register additional transports on the logger without touching
 * call sites — see `lib/logger/index.ts`.
 */
export interface LogTransport {
  readonly name: string;
  log(entry: LogEntry): void;
}
