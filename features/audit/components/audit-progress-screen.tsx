"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Check,
  CircleDashed,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  TriangleAlert,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  cancelRunAction,
  completeReviewStageAction,
  retryStageAction,
  startAuditAction,
} from "@/features/audit/actions/orchestrator-actions";
import type { AuditProgress, RunStatus } from "@/services/audit/types";
import { AUDIT_STAGE_LABELS } from "@/services/audit/types";

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function StatusIcon({ status }: { status: RunStatus }) {
  switch (status) {
    case "COMPLETED":
      return <Check className="size-4 text-emerald-600" aria-hidden="true" />;
    case "RUNNING":
    case "RETRYING":
      return <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />;
    case "WAITING":
      return <UserCheck className="size-4 text-amber-600" aria-hidden="true" />;
    case "FAILED":
      return <TriangleAlert className="size-4 text-destructive" aria-hidden="true" />;
    case "CANCELLED":
      return <Ban className="size-4 text-muted-foreground" aria-hidden="true" />;
    default:
      return <CircleDashed className="size-4 text-muted-foreground" aria-hidden="true" />;
  }
}

const RUN_BADGE: Record<RunStatus, "default" | "secondary" | "destructive" | "outline"> = {
  QUEUED: "secondary",
  RUNNING: "default",
  RETRYING: "default",
  WAITING: "secondary",
  COMPLETED: "default",
  FAILED: "destructive",
  CANCELLED: "outline",
};

/**
 * Audit run progress (Sprint 3.6): progress bar, stage timeline with history,
 * and workflow controls. Stage work is SIMULATED (mock executors) except
 * human review, which genuinely waits — the banner says so.
 */
export function AuditProgressScreen({
  submissionId,
  progress,
  canManage,
}: {
  submissionId: string;
  progress: AuditProgress | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const active =
    progress !== null && (progress.status === "RUNNING" || progress.status === "RETRYING");

  // Poll while the run is actively executing (mock stages finish in seconds).
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 1500);
    return () => clearInterval(timer);
  }, [active, router]);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    try {
      const result = await action();
      if (!result.ok) toast.error(result.error ?? "Action failed.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <Alert>
        <AlertTitle>Simulated pipeline</AlertTitle>
        <AlertDescription>
          OCR, CRM retrieval, matching, and report stages complete via mock executors — real
          integrations replace them one by one without changing this workflow. Human review
          genuinely waits for your confirmation.
        </AlertDescription>
      </Alert>

      {!progress ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <p className="max-w-md text-sm text-muted-foreground">
              No audit run yet for this submission.
            </p>
            {canManage && (
              <Button
                type="button"
                disabled={busy}
                onClick={() => run(() => startAuditAction(submissionId))}
              >
                {busy ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Play aria-hidden="true" />
                )}
                Start audit run
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Status + progress bar */}
          <Card>
            <CardContent className="flex flex-col gap-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant={RUN_BADGE[progress.status]}>
                    {progress.status.toLowerCase()}
                  </Badge>
                  {progress.currentStage && (
                    <span className="text-sm text-muted-foreground">
                      current stage: {AUDIT_STAGE_LABELS[progress.currentStage]}
                    </span>
                  )}
                </div>
                <p className="font-mono text-sm text-muted-foreground tabular-nums">
                  elapsed {formatMs(progress.elapsedMs)}
                  {progress.estimatedRemainingMs !== null &&
                    progress.status !== "COMPLETED" &&
                    ` · ~${formatMs(progress.estimatedRemainingMs)} remaining`}
                </p>
              </div>
              <div
                role="progressbar"
                aria-valuenow={progress.percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Audit progress"
                className="h-3 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={cn(
                    "h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none",
                    progress.status === "FAILED" && "bg-destructive",
                    progress.status === "CANCELLED" && "bg-muted-foreground"
                  )}
                  style={{ width: `${Math.max(progress.percentage, 2)}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {progress.completedStages.length} of {progress.stages.length} stages complete (
                {progress.percentage}%)
              </p>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardContent className="py-4">
              <ol aria-label="Audit stage timeline" className="m-0 list-none space-y-0 p-0">
                {progress.stages.map((stage, index) => (
                  <li key={stage.stage} className="relative flex gap-3 pb-5 last:pb-0">
                    {index < progress.stages.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="absolute top-6 left-[11px] h-full w-px bg-border"
                      />
                    )}
                    <span className="z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-background">
                      <StatusIcon status={stage.status} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{AUDIT_STAGE_LABELS[stage.stage]}</span>
                        <Badge variant={RUN_BADGE[stage.status]} className="text-[10px]">
                          {stage.status.toLowerCase()}
                        </Badge>
                        {stage.attempt > 1 && (
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">
                            attempt {stage.attempt}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                        {stage.startedAt && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3" aria-hidden="true" />
                            {new Date(stage.startedAt).toLocaleTimeString()}
                            {stage.completedAt &&
                              ` → ${new Date(stage.completedAt).toLocaleTimeString()}`}
                          </span>
                        )}
                        {stage.waitingReason && <span>{stage.waitingReason}</span>}
                        {stage.error && <span className="text-destructive">{stage.error}</span>}
                      </p>
                      {canManage && stage.status === "WAITING" && (
                        <Button
                          type="button"
                          size="sm"
                          className="mt-2"
                          disabled={busy}
                          onClick={() =>
                            run(() => completeReviewStageAction(submissionId, progress.jobId))
                          }
                        >
                          <UserCheck aria-hidden="true" />
                          Mark review complete
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {/* Controls */}
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {progress.status === "FAILED" && (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => retryStageAction(submissionId, progress.jobId))}
                >
                  <RefreshCw aria-hidden="true" />
                  Retry failed stage
                </Button>
              )}
              {!["COMPLETED", "CANCELLED"].includes(progress.status) && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => run(() => cancelRunAction(submissionId, progress.jobId))}
                >
                  <Ban aria-hidden="true" />
                  Cancel run
                </Button>
              )}
              {["COMPLETED", "CANCELLED", "FAILED"].includes(progress.status) && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => run(() => startAuditAction(submissionId))}
                >
                  <Play aria-hidden="true" />
                  Start new run
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
