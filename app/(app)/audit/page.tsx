import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Audit",
};

export default function AuditPage() {
  return (
    <>
      <PageHeader
        title="Audit"
        description="Logbook audit sessions, uploads, and compliance checks."
      />
      <ModulePlaceholder
        moduleName="Audit"
        description="Audit sessions, logbook uploads, and AI-assisted compliance checks will live here."
        plannedMilestone="Milestone 2"
      />
    </>
  );
}
