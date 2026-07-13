"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FindingsList,
  FindingsSummary,
  rollupFindings,
  type FindingStatus,
  type FindingView,
} from "@/components/findings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { transitionFindingAction } from "@/features/findings/actions/finding-actions";

/**
 * Findings workspace. Since Sprint 3.7 findings are REAL rows produced by
 * the rule engine (via audit runs) and status changes persist. Until OCR and
 * live CRM integrate, the engine's inputs are simulated — the banner says so.
 */
export function FindingsScreen({ initialFindings }: { initialFindings: FindingView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleStatusChange(id: string, status: FindingStatus) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await transitionFindingAction(id, status);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Finding marked ${status.toLowerCase()}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <Alert>
        <AlertTitle>Real findings, simulated inputs</AlertTitle>
        <AlertDescription>
          These findings are produced by the deterministic rule engine during audit runs and your
          status changes are saved. Until OCR and live CRM integration land, the engine evaluates
          simulated logbook readings against mock CRM records.
        </AlertDescription>
      </Alert>

      {initialFindings.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="max-w-md text-sm text-muted-foreground">
              No findings yet. Run an audit — open a submitted submission and start its audit run;
              the matching stage writes findings here.
            </p>
            <Button asChild variant="outline">
              <Link href="/audit">Go to submissions</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <FindingsSummary rollup={rollupFindings(initialFindings)} />
          <FindingsList findings={initialFindings} onStatusChange={handleStatusChange} />
        </>
      )}
    </div>
  );
}
