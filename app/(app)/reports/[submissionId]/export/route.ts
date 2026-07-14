import { requirePermission } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import type { Actor } from "@/services/audit-submission-service";
import { getReport, renderReportHtml } from "@/services/report";

/**
 * Read-only report export — `?format=json` (default) or `?format=html`.
 * Both formats are rebuilt from stored evidence only; no live CRM read
 * happens on this path. Access is branch-scoped exactly like the report page
 * (`getReport` enforces it).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ submissionId: string }> }
) {
  const user = await requirePermission("reports:view");
  const { submissionId } = await context.params;
  const actor: Actor = { id: user.id, role: user.role, branchId: user.branchId ?? null };

  const format = new URL(request.url).searchParams.get("format") === "html" ? "html" : "json";

  try {
    const model = await getReport(actor, submissionId);

    if (format === "html") {
      return new Response(renderReportHtml(model), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="audit-report-${submissionId}.html"`,
        },
      });
    }

    return new Response(JSON.stringify(model), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="audit-report-${submissionId}.json"`,
      },
    });
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}
