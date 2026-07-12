import type { Metadata } from "next";
import { ShieldX } from "lucide-react";
import { ErrorState } from "@/components/shared/error-state";

export const metadata: Metadata = {
  title: "Access denied",
};

export default function ForbiddenPage() {
  return (
    <ErrorState
      icon={ShieldX}
      code="403"
      title="Access denied"
      description="Your role doesn't have permission to view this page. Contact your administrator if you believe this is a mistake."
    />
  );
}
