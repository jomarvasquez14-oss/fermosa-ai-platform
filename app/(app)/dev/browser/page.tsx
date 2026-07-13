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
        description="Internal developer tool: exercise the browser-automation framework (session, navigation, selector registry, failure recovery) against a mock CRM. No live CRM access exists."
      />
      <BrowserDevScreen initialState={state} />
    </>
  );
}
