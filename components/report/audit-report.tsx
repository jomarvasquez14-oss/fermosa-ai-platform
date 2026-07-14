import {
  FindingCategoryBadge,
  FindingSeverityBadge,
  FindingStatusBadge,
} from "@/components/findings/finding-badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReportModel } from "@/services/report";
import { formatDateOnly, formatDateTime } from "@/utils/format";

interface AuditReportProps {
  model: ReportModel;
}

const SEVERITY_ORDER: Array<keyof ReportModel["severitySummary"]> = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
];

/**
 * On-screen render of a `ReportModel` (M0046). Purely presentational — all
 * data was already assembled by `getReport`/`buildReportModel` from stored
 * evidence; this component performs no fetching and no further computation
 * beyond display formatting.
 */
export function AuditReport({ model }: AuditReportProps) {
  const { submission } = model;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 print:max-w-none">
      {/* @page keeps printed output tidy; Tailwind has no selector for it. */}
      <style>{"@page { margin: 1.5cm; }"}</style>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Report</h1>
        <p className="text-sm text-muted-foreground">
          Generated {formatDateTime(model.generatedAt)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Executive Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            Submission <strong>{submission.id}</strong> for{" "}
            <strong>{submission.branchName}</strong>, audited on{" "}
            <strong>{formatDateOnly(submission.auditDate)}</strong>.
          </p>
          <p>
            <strong>{model.findingSummary.total}</strong> finding(s) across{" "}
            <strong>{model.evidence.length}</strong> evidence snapshot(s), built entirely from
            stored evidence — no live CRM read was performed to produce this report.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submission</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground uppercase">ID</dt>
              <dd className="font-mono text-xs">{submission.id}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Audit date</dt>
              <dd>{formatDateOnly(submission.auditDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Status</dt>
              <dd>
                <Badge variant="outline">{submission.status}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Submitted at</dt>
              <dd>{submission.submittedAt ? formatDateTime(submission.submittedAt) : "—"}</dd>
            </div>
          </dl>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase">Branch</h3>
              <p className="text-sm">{submission.branchName}</p>
            </div>
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase">Auditor</h3>
              <p className="text-sm">{submission.auditorName}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {model.timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No timeline events.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {model.timeline.map((entry, index) => (
                <li key={index} className="flex gap-2">
                  <span className="text-muted-foreground">{entry.at}</span>
                  <span>{entry.label}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Finding Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm">
            Total findings: <strong>{model.findingSummary.total}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(model.findingSummary.byStatus).map(([status, count]) => (
              <Badge key={status} variant="secondary">
                {status}: {count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Severity Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SEVERITY_ORDER.map((severity) => (
              <Badge key={severity} variant="outline">
                {severity}: {model.severitySummary[severity]}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Findings</CardTitle>
        </CardHeader>
        <CardContent>
          {model.findings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No findings were recorded.</p>
          ) : (
            <ul className="space-y-3">
              {model.findings.map((finding) => (
                <li key={finding.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <FindingSeverityBadge severity={finding.severity} />
                    <span className="font-medium">{finding.title}</span>
                    <FindingCategoryBadge category={finding.category} />
                    <FindingStatusBadge status={finding.status} />
                  </div>
                  <p className="mt-1 text-muted-foreground">{finding.detail}</p>
                  {finding.recommendation && (
                    <p className="mt-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase">
                        Recommendation:{" "}
                      </span>
                      {finding.recommendation}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evidence</CardTitle>
        </CardHeader>
        <CardContent>
          {model.evidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No evidence snapshots are attached to this submission.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {model.evidence.map((snapshot) => (
                <li key={snapshot.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Patient <strong>{snapshot.crmPatientId}</strong> via{" "}
                      {snapshot.connectorKind} ({snapshot.selectorVersion})
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(snapshot.retrievedAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {snapshot.counts.treatments} treatment(s) · {snapshot.counts.invoices}{" "}
                    invoice(s) · {snapshot.counts.activity} activity record(s)
                  </p>
                  <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
                    {snapshot.contentHash}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          {model.recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No corrective action was identified.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {model.recommendations.map((recommendation, index) => (
                <li key={index}>{recommendation}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appendix</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Connector kind</dt>
              <dd>{model.appendix.connectorKind ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Selector version</dt>
              <dd>{model.appendix.selectorVersion ?? "—"}</dd>
            </div>
          </dl>
          <div className="mt-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase">
              Snapshot content hashes
            </h3>
            {model.appendix.snapshotHashes.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="mt-1 space-y-1 font-mono text-xs break-all text-muted-foreground">
                {model.appendix.snapshotHashes.map((hash) => (
                  <li key={hash}>{hash}</li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
