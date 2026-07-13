import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "CRM",
};

export default async function CrmPage() {
  // Placeholder module: any authenticated user may see it (matches the nav),
  // but the server guard is mandatory regardless (PROJECT_RULES 2).
  await requireUser();

  return (
    <>
      <PageHeader title="CRM" description="Customer relationship management." />
      <ModulePlaceholder
        moduleName="CRM"
        description="Customer accounts, interactions, and pipeline tracking are planned for a future milestone."
      />
    </>
  );
}
