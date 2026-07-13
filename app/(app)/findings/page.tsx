import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { FindingsScreen } from "@/features/findings/components/findings-screen";
import { MOCK_FINDINGS } from "@/features/findings/data/mock-findings";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Findings",
};

export default async function FindingsPage() {
  await requirePermission("audit:manage");

  return (
    <>
      <PageHeader
        title="Findings"
        description="Every discrepancy the platform detects, in one canonical format — from rules, CRM discovery, OCR, AI, and manual review."
      />
      <FindingsScreen initialFindings={[...MOCK_FINDINGS]} />
    </>
  );
}
