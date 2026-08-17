import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { getBrowserDevStateAction } from "@/features/browser-dev/actions/browser-dev-actions";
import { BrowserDevScreen } from "@/features/browser-dev/components/browser-dev-screen";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Browser Dev",
};

export default async function BrowserDevPage() {
  await requirePermission("playground:access");
  const state = await getBrowserDevStateAction();

  return (
    <>
      <PageHeader
        title="Browser Framework Dev"
        description="Internal developer tool: framework drills (session, navigation, selector registry, failure recovery) run on a mock CRM; the connector cockpit runs through getCRMConnector() and drives the live CRM when CRM_CONNECTOR=playwright is configured."
      />
      <BrowserDevScreen initialState={state} />
    </>
  );
}
