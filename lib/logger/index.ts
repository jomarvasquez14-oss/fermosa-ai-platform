import { ConsoleTransport } from "@/lib/logger/transports/console-transport";
import { LOG_LEVELS, type LogContext, type LogLevel, type LogTransport } from "@/lib/logger/types";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  if (configured && LOG_LEVELS.includes(configured)) return configured;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Application logger.
 *
 * Architecture-only for Milestone 1: a level-filtered, transport-based logger
 * with a console transport. When an external service (Datadog, Sentry,
 * Axiom, ...) is adopted, implement `LogTransport` and register it via
 * `logger.addTransport()` — no call sites change.
 *
 * Usage: `logger.info("Audit session created", { sessionId })`
 */
class Logger {
  private transports: LogTransport[] = [];
  private minLevel: LogLevel;

  constructor() {
    this.minLevel = resolveMinLevel();
    this.addTransport(new ConsoleTransport());
  }

  addTransport(transport: LogTransport): void {
    this.transports.push(transport);
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log("error", message, context);
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.minLevel]) return;

    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
    };

    for (const transport of this.transports) {
      try {
        transport.log(entry);
      } catch {
        // A failing transport must never crash the request path.
      }
    }
  }
}

export const logger = new Logger();
export type { LogContext, LogLevel, LogTransport } from "@/lib/logger/types";
