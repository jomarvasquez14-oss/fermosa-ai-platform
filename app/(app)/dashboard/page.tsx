import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { AdminDashboardView } from "@/features/dashboard/components/admin-dashboard-view";
import { AuditorDashboardView } from "@/features/dashboard/components/auditor-dashboard-view";
import { BranchDashboardView } from "@/features/dashboard/components/branch-dashboard-view";
import { ROLES } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import type { Actor } from "@/services/audit-submission-service";
import { getAdminDashboard, getDashboard } from "@/services/dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const actor: Actor = { id: user.id, role: user.role, branchId: user.branchId ?? null };
  const firstName = user.name?.split(" ")[0] ?? "there";

  const dashboard = await getDashboard(actor);
  // Super-Admins additionally get the cross-branch roll-up.
  const admin = user.role === ROLES.SUPER_ADMIN ? await getAdminDashboard(actor) : null;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Audit activity, findings, and compliance — from real submissions only."
      />

      {dashboard.role === "branch" ? (
        <BranchDashboardView data={dashboard} />
      ) : (
        <AuditorDashboardView data={dashboard} />
      )}

      {admin ? (
        <div className="mt-6 flex flex-col gap-4">
          <PageHeader title="Administration" description="Cross-branch ranking and trends." />
          <AdminDashboardView data={admin} />
        </div>
      ) : null}
    </>
  );
}
