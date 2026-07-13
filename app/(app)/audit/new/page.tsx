import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { SubmissionEditor } from "@/features/audit/components/submission-editor";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "New Upload",
};

export default async function NewUploadPage() {
  await requirePermission("audit:upload");

  return (
    <>
      <PageHeader
        title="New Upload"
        description="Stage logbook images for an audit date, then save a draft or submit."
      />
      <SubmissionEditor />
    </>
  );
}
