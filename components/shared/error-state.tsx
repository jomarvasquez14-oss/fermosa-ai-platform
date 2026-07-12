import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  icon: LucideIcon;
  code: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

/** Shared full-page layout for 404 / 401 / 403 / 500 pages. */
export function ErrorState({ icon: Icon, code, title, description, action }: ErrorStateProps) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <Icon className="size-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium tracking-widest text-muted-foreground">{code}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {action ?? (
        <Button asChild>
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      )}
    </main>
  );
}
