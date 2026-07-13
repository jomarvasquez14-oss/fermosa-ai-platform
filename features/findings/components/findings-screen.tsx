"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  FindingsList,
  FindingsSummary,
  canTransition,
  rollupFindings,
  type FindingStatus,
  type FindingView,
} from "@/components/findings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Findings workspace (Sprint 3.5). Runs on mock findings and keeps status
 * changes client-side — persistence and real producers arrive with the rule
 * engine. The banner says so (placeholder honesty, PROJECT_RULES 28).
 */
export function FindingsScreen({ initialFindings }: { initialFindings: FindingView[] }) {
  const [findings, setFindings] = useState(initialFindings);

  function handleStatusChange(id: string, status: FindingStatus) {
    setFindings((current) =>
      current.map((finding) => {
        if (finding.id !== id) return finding;
        if (!canTransition(finding.status, status)) return finding;
        return { ...finding, status };
      })
    );
    toast.success(`Finding marked ${status.toLowerCase()}`, {
      description: "Preview only — status changes are not persisted until producers ship.",
    });
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <Alert>
        <AlertTitle>Preview with simulated findings</AlertTitle>
        <AlertDescription>
          These findings are mock data illustrating the canonical output format. Real findings
          arrive when the rule engine and CRM discovery are integrated; status changes here are not
          saved.
        </AlertDescription>
      </Alert>

      <FindingsSummary rollup={rollupFindings(findings)} />
      <FindingsList findings={findings} onStatusChange={handleStatusChange} />
    </div>
  );
}
