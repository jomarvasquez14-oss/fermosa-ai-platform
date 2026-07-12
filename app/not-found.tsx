import type { Metadata } from "next";
import { FileQuestion } from "lucide-react";
import { ErrorState } from "@/components/shared/error-state";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFoundPage() {
  return (
    <ErrorState
      icon={FileQuestion}
      code="404"
      title="Page not found"
      description="The page you're looking for doesn't exist or may have been moved."
    />
  );
}
