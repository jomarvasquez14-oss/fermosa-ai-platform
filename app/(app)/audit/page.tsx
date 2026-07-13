import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { SubmissionList } from "@/features/audit/components/submission-list";
import { hasPermission } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Audit",
};

export default async function AuditPage() {
  const user = await requirePermission("audit:view");
  const canUpload = hasPermission(user.role, "audit:upload");

  return (
    <>
      <PageHeader
        title="Audit"
        description="Logbook submissions per audit date. Drafts stay editable until submitted."
      >
        {canUpload && (
          <Button asChild size="lg">
            <Link href="/audit/new">
              <Plus aria-hidden="true" />
              New Upload
            </Link>
          </Button>
        )}
      </PageHeader>
      <SubmissionList />
    </>
  );
}
