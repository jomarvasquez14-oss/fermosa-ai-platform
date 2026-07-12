import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";

export const metadata: Metadata = {
  title: "Unauthorized",
};

export default function UnauthorizedPage() {
  return (
    <ErrorState
      icon={Lock}
      code="401"
      title="Authentication required"
      description="You need to sign in before you can access this page."
      action={
        <Button asChild>
          <Link href="/login">Go to Login</Link>
        </Button>
      }
    />
  );
}
