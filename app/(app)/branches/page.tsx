import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Branches",
};

export default async function BranchesPage() {
  const user = await requireUser();
  const scopedToAssigned = user.role === ROLES.BRANCH_MANAGER;

  return (
    <>
      <PageHeader
        title="Branches"
        description={
          scopedToAssigned
            ? "Your assigned branch."
            : "All branch locations across the organization."
        }
      />
      <ModulePlaceholder
        moduleName="Branches"
        description="Branch directory and management tools are planned for an upcoming milestone. Branch Managers will only see their assigned branch."
      />
    </>
  );
}
