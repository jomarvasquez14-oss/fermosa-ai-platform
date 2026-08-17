import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { AnalyticsView } from "@/features/analytics/components/analytics-view";
import { requirePermission } from "@/lib/auth/session";
import { getAnalytics } from "@/services/analytics";

export const metadata: Metadata = {
  title: "Analytics",
};

export default async function AnalyticsPage() {
  // Same gate as Reports (Auditor / Super-Admin), enforced in middleware too.
  await requirePermission("reports:view");
  const analytics = await getAnalytics();

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Operational trends from stored CRM evidence snapshots — never the live CRM."
      />
      <AnalyticsView data={analytics} />
    </>
  );
}
