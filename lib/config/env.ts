import "server-only";
import { z } from "zod";
import { ConfigurationError } from "@/lib/errors";

/**
 * Validated server environment.
 *
 * Call `getServerEnv()` instead of reading `process.env` in server code, so
 * misconfiguration fails fast with a precise message instead of surfacing as
 * a confusing downstream error. Validation is lazy (first call) and cached,
 * which keeps `next build` independent of runtime-only variables.
 *
 * Never import this from client components — it is server-only by design.
 */

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (see .env.example)"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),

  // Architecture seams (Milestone 1.1) — which implementation the factories
  // select once implementations exist. Defaults are the safest option.
  // "playwright" is an accepted alias for "browser-automation" (ADR-033).
  CRM_CONNECTOR: z.enum(["browser-automation", "playwright", "api", "mock"]).default("mock"),
  /**
   * Live CRM access (browser-automation connector only, ADR-033). All three
   * are required the moment that connector is selected — validated at
   * connector construction, not here, so mock-only setups need none.
   */
  CRM_URL: z.string().url().optional(),
  CRM_USERNAME: z.string().min(1).optional(),
  CRM_PASSWORD: z.string().min(1).optional(),
  /** Headed Chromium is for supervised verification runs only. */
  CRM_BROWSER_HEADLESS: z.enum(["true", "false"]).default("true"),
  // Implemented providers: mock (3.0), claude (3.1). Others land in 3.x.
  AI_PROVIDER: z
    .enum(["mock", "openai-vision", "claude", "gemini", "azure-openai"])
    .default("mock"),
  /** Required only when the Claude provider is actually invoked. */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // Storage seam (Sprint 2A.2) — only "local" is implemented today.
  STORAGE_PROVIDER: z.enum(["local", "s3", "azure-blob", "gcs", "r2", "supabase"]).default("local"),
  /** Root directory for the local filesystem provider (gitignored). */
  STORAGE_LOCAL_ROOT: z.string().min(1).default(".storage"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new ConfigurationError(`Invalid server environment:\n${details}`);
  }

  cached = parsed.data;
  return cached;
}
