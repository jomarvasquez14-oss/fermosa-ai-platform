import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Users",
};

export default async function UsersPage() {
  await requirePermission("users:manage");

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage platform users, roles, and branch assignments."
      />
      <ModulePlaceholder
        moduleName="Users"
        description="User administration — inviting users, assigning roles and branches — is planned for an upcoming milestone."
      />
    </>
  );
}
