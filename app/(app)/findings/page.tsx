import type { Metadata } from "next";
import type { FindingView } from "@/components/findings";
import { PageHeader } from "@/components/shared/page-header";
import { FindingsScreen } from "@/features/findings/components/findings-screen";
import { requirePermission } from "@/lib/auth/session";
import { findingService } from "@/services/finding-service";

export const metadata: Metadata = {
  title: "Findings",
};

export default async function FindingsPage() {
  const user = await requirePermission("audit:manage");
  const records = await findingService.list({
    id: user.id,
    role: user.role,
    branchId: user.branchId ?? null,
  });

  // FindingRecord and FindingView share their shape by construction.
  const findings: FindingView[] = records;

  return (
    <>
      <PageHeader
        title="Findings"
        description="Every discrepancy the platform detects, in one canonical format — from rules, CRM discovery, OCR, AI, and manual review."
      />
      <FindingsScreen initialFindings={findings} />
    </>
  );
}
