import { readFileSync } from "fs";
import path from "path";

/**
 * Load .env into process.env for integration tests (Vitest does not read it,
 * and Prisma resolves DATABASE_URL from the process environment at runtime).
 * Executed at import time — import this BEFORE any module that touches env.
 */
const envPath = path.resolve(__dirname, "../../.env");
try {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (match && match[1] && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
} catch {
  // No .env — tests relying on it will fail with a clear connection error.
}
