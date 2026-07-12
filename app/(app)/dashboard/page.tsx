import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { RecentActivity } from "@/features/dashboard/components/recent-activity";
import { StatsCards } from "@/features/dashboard/components/stats-cards";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const firstName = user.name?.split(" ")[0] ?? "there";

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Here's an overview of audit activity across your branches."
      />
      <StatsCards />
      <div className="grid gap-4 lg:grid-cols-2">
        <RecentActivity />
      </div>
    </>
  );
}
