import type { LogEntry, LogTransport } from "@/lib/logger/types";

/**
 * Development/default transport that writes structured lines to the console.
 * Production deployments can swap in transports for Datadog, Sentry, etc.
 */
export class ConsoleTransport implements LogTransport {
  readonly name = "console";

  log(entry: LogEntry): void {
    const { level, message, timestamp, context } = entry;
    const line = `[${timestamp}] ${level.toUpperCase().padEnd(5)} ${message}`;

    const method =
      level === "error" ? console.error : level === "warn" ? console.warn : console.log;

    if (context && Object.keys(context).length > 0) {
      method(line, context);
    } else {
      method(line);
    }
  }
}
