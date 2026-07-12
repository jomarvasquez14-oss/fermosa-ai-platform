import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "CRM",
};

export default function CrmPage() {
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
