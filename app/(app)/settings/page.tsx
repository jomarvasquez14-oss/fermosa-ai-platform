import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  await requirePermission("settings:manage");

  return (
    <>
      <PageHeader title="Settings" description="Platform configuration and system preferences." />
      <ModulePlaceholder
        moduleName="Settings"
        description="System settings management (backed by the SystemSetting model) is planned for an upcoming milestone."
      />
    </>
  );
}
