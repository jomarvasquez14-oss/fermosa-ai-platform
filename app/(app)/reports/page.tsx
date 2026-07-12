import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Reports",
};

export default async function ReportsPage() {
  await requirePermission("reports:view");

  return (
    <>
      <PageHeader title="Reports" description="Cross-branch audit and compliance reporting." />
      <ModulePlaceholder
        moduleName="Reports"
        description="Compliance summaries, branch comparisons, and exportable reports will live here."
      />
    </>
  );
}
