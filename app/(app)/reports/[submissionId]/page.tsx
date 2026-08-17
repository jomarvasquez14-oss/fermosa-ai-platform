import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileJson } from "lucide-react";
import { AuditReport } from "@/components/report/audit-report";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import type { Actor } from "@/services/audit-submission-service";
import { getReport } from "@/services/report";

export const metadata: Metadata = {
  title: "Audit Report",
};

export default async function ReportPage(props: { params: Promise<{ submissionId: string }> }) {
  const user = await requirePermission("reports:view");
  const { submissionId } = await props.params;
  const actor: Actor = { id: user.id, role: user.role, branchId: user.branchId ?? null };

  let model;
  try {
    model = await getReport(actor, submissionId);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  return (
    <>
      <PageHeader
        title={`Report — ${model.submission.branchName}`}
        description="Reproducible audit report, assembled entirely from stored evidence."
      >
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button asChild variant="outline" size="sm">
            <Link href={`/reports/${submissionId}/export?format=html`}>
              <Download aria-hidden="true" />
              Export HTML
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/reports/${submissionId}/export?format=json`}>
              <FileJson aria-hidden="true" />
              Export JSON
            </Link>
          </Button>
        </div>
      </PageHeader>
      <AuditReport model={model} />
    </>
  );
}
