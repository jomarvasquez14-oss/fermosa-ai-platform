/**
 * GET /api/health — unauthenticated liveness + database reachability.
 *
 * Same contract as the Hub Inventory version: SELECT 1, {ok} or 503, no
 * facts beyond that on an unauthenticated surface. Failures log through the
 * app's own logger so the reason lands where every other error already goes.
 *
 * BEFORE APPLYING: read middleware.ts — if its matcher covers /api, widen it
 * for exactly this path, in the same commit (see staged/health/README.md).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("health check failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
