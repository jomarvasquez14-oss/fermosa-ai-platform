import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { CrmDevScreen, type CrmDevCatalog } from "@/features/crm-dev/components/crm-dev-screen";
import { requirePermission } from "@/lib/auth/session";
import { ERROR_TRIGGERS, FIXTURE_RECORDS } from "@/services/crm/connectors/mock/fixtures";

export const metadata: Metadata = {
  title: "CRM Dev",
};

const SCENARIOS: Record<string, string> = {
  "c-1001": "normal",
  "c-1002": "multi-session package",
  "c-1003": "no treatments",
  "c-1004": "duplicate name (a)",
  "c-1005": "duplicate name (b)",
  "c-1006": "missing invoice",
  "c-1007": "empty activity log",
  "c-1008": "deleted treatment",
  "c-1009": "edited treatment",
};

export default async function CrmDevPage() {
  await requirePermission("playground:access");

  const catalog: CrmDevCatalog = {
    fixtures: FIXTURE_RECORDS.map((record) => ({
      crmId: record.patient.crmId,
      fullName: record.patient.fullName,
      scenario: SCENARIOS[record.patient.crmId] ?? "—",
    })),
    errorTriggers: Object.keys(ERROR_TRIGGERS),
  };

  return (
    <>
      <PageHeader
        title="CRM Dev"
        description="Internal developer tool: exercise the CRM connector seam against fixture data. No live CRM access."
      />
      <CrmDevScreen catalog={catalog} />
    </>
  );
}
