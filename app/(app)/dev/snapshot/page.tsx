import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { getSnapshotDevStateAction } from "@/features/snapshot-dev/actions/snapshot-dev-actions";
import { SnapshotDevScreen } from "@/features/snapshot-dev/components/snapshot-dev-screen";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Snapshot Dev",
};

export default async function SnapshotDevPage() {
  await requirePermission("playground:access");
  const state = await getSnapshotDevStateAction();

  return (
    <>
      <PageHeader
        title="Audit Evidence Snapshots"
        description="Internal developer tool: capture what the CRM says right now as immutable, hash-sealed audit evidence, then compare it against the live CRM later. The CRM remains the only source of truth — nothing here synchronizes or mirrors it."
      />
      <SnapshotDevScreen initialState={state} />
    </>
  );
}
