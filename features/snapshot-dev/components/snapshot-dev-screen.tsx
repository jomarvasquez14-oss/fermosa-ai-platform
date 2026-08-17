"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Camera,
  Download,
  FileSearch,
  GitCompareArrows,
  Loader2,
  Search,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  snapshotCompareAction,
  snapshotCreateAction,
  snapshotFindPatientsAction,
  snapshotListAction,
  snapshotLoadAction,
  snapshotRetrieveLiveAction,
  type SnapshotDevState,
} from "@/features/snapshot-dev/actions/snapshot-dev-actions";
import type { FindPatientsResult, NormalizedCrmPatientRecord } from "@/services/crm";
import type {
  EvidenceSnapshot,
  SnapshotComparison,
  SnapshotMetadata,
} from "@/services/crm/snapshot/evidence";

export function SnapshotDevScreen({ initialState }: { initialState: SnapshotDevState }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  const [submissionId, setSubmissionId] = useState(initialState.submissions[0]?.id ?? "");
  const [searchName, setSearchName] = useState("");
  const [searchCrmId, setSearchCrmId] = useState("");
  const [windowFrom, setWindowFrom] = useState("");
  const [windowTo, setWindowTo] = useState("");

  const [findResult, setFindResult] = useState<FindPatientsResult | null>(null);
  const [selectedCrmId, setSelectedCrmId] = useState("");
  const [liveRecord, setLiveRecord] = useState<NormalizedCrmPatientRecord | null>(null);
  const [snapshot, setSnapshot] = useState<EvidenceSnapshot | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotMetadata[] | null>(null);
  const [comparison, setComparison] = useState<SnapshotComparison | null>(null);

  const window = windowFrom && windowTo ? { from: windowFrom, to: windowTo } : undefined;

  async function run<T>(
    action: () => Promise<{ ok: true; data: T } | { ok: false; error: string; code?: string }>,
    onData: (data: T) => void
  ) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError({ message: result.error, code: result.code });
        return;
      }
      onData(result.data);
    } finally {
      setBusy(false);
    }
  }

  const search = () =>
    run(
      () =>
        snapshotFindPatientsAction({
          name: searchName || undefined,
          crmId: searchCrmId || undefined,
        }),
      (data) => {
        setFindResult(data);
        setLiveRecord(null);
        setComparison(null);
        if (data.outcome === "found") setSelectedCrmId(data.candidates[0]!.crmId);
      }
    );

  const retrieveLive = () =>
    run(
      () => snapshotRetrieveLiveAction(selectedCrmId, window),
      (data) => {
        setLiveRecord(data);
        setComparison(null);
      }
    );

  const createSnapshot = () =>
    run(
      () => snapshotCreateAction({ submissionId, crmId: selectedCrmId, window }),
      (data) => {
        setSnapshot(data);
        setComparison(null);
        void refreshList();
      }
    );

  const refreshList = () =>
    run(
      () => snapshotListAction(submissionId),
      (data) => setSnapshots(data)
    );

  const loadSnapshot = (id: string) =>
    run(
      () => snapshotLoadAction(id),
      (data) => {
        setSnapshot(data);
        setComparison(null);
      }
    );

  const compare = () =>
    snapshot &&
    run(
      () => snapshotCompareAction(snapshot.metadata.id),
      (data) => setComparison(data)
    );

  function exportJson() {
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `evidence-snapshot-${snapshot.metadata.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      {/* ---- Controls ---- */}
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="size-4" aria-hidden="true" />
              Capture evidence
            </CardTitle>
            <CardDescription>
              Reads the CRM through <code className="font-mono text-xs">getCRMConnector()</code> (
              {initialState.connectorKind}) and seals the result as immutable evidence on an audit
              submission. The CRM stays the only source of truth.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="snap-submission">Audit submission</Label>
              <select
                id="snap-submission"
                className="border-input bg-transparent focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none"
                value={submissionId}
                onChange={(event) => {
                  setSubmissionId(event.target.value);
                  setSnapshots(null);
                }}
              >
                {initialState.submissions.length === 0 && (
                  <option value="">No submissions — create one in /audit first</option>
                )}
                {initialState.submissions.map((submission) => (
                  <option key={submission.id} value={submission.id}>
                    {submission.auditDate} · {submission.branchName} · {submission.status}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="snap-name">Patient name</Label>
                <Input
                  id="snap-name"
                  value={searchName}
                  placeholder="e.g. Santos"
                  onChange={(event) => setSearchName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void search();
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="snap-crmid">CRM ID</Label>
                <Input
                  id="snap-crmid"
                  value={searchCrmId}
                  placeholder="e.g. c-1001"
                  onChange={(event) => setSearchCrmId(event.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="snap-from">Window from</Label>
                <Input
                  id="snap-from"
                  type="date"
                  value={windowFrom}
                  onChange={(event) => setWindowFrom(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="snap-to">Window to</Label>
                <Input
                  id="snap-to"
                  type="date"
                  value={windowTo}
                  onChange={(event) => setWindowTo(event.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={busy} onClick={() => void search()}>
                {busy ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Search aria-hidden="true" />
                )}
                Search patients
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || !selectedCrmId}
                onClick={() => void retrieveLive()}
              >
                <FileSearch aria-hidden="true" /> Retrieve live CRM
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy || !selectedCrmId || !submissionId}
                onClick={() => void createSnapshot()}
              >
                <Camera aria-hidden="true" /> Create snapshot
              </Button>
            </div>
            {selectedCrmId && (
              <p className="text-xs text-muted-foreground">
                Selected patient: <code className="font-mono">{selectedCrmId}</code>
              </p>
            )}
          </CardContent>
        </Card>

        {findResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Lookup outcome
                <Badge
                  variant={
                    findResult.outcome === "found"
                      ? "default"
                      : findResult.outcome === "ambiguous"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {findResult.outcome}
                </Badge>
              </CardTitle>
              {findResult.outcome === "ambiguous" && (
                <CardDescription>
                  Multiple candidates — pick one below; nothing is auto-selected.
                </CardDescription>
              )}
            </CardHeader>
            {findResult.candidates.length > 0 && (
              <CardContent>
                <ul className="m-0 list-none space-y-1 p-0 text-sm">
                  {findResult.candidates.map((candidate) => (
                    <li key={candidate.crmId}>
                      <button
                        type="button"
                        className={`flex w-full flex-wrap items-baseline gap-x-3 rounded-md px-2 py-1.5 text-left hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                          candidate.crmId === selectedCrmId ? "bg-muted" : ""
                        }`}
                        onClick={() => setSelectedCrmId(candidate.crmId)}
                      >
                        <span className="font-medium">{candidate.fullName}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {candidate.crmId}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stored snapshots</CardTitle>
            <CardDescription>Evidence already sealed for the selected submission.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !submissionId}
              onClick={() => void refreshList()}
            >
              List snapshots
            </Button>
            {snapshots && snapshots.length === 0 && (
              <p className="text-sm text-muted-foreground">No snapshots yet.</p>
            )}
            {snapshots && snapshots.length > 0 && (
              <ul className="m-0 list-none space-y-1 p-0 text-sm">
                {snapshots.map((meta) => (
                  <li key={meta.id}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-baseline gap-x-3 rounded-md px-2 py-1.5 text-left hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      onClick={() => void loadSnapshot(meta.id)}
                    >
                      <span className="font-medium">{meta.crmPatientId}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(meta.createdAt).toLocaleString()}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {meta.contentHash.slice(0, 12)}…
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- Evidence ---- */}
      <div className="flex min-w-0 flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>{error.code ?? "Error"}</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {comparison && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Snapshot vs live CRM
                <Badge variant={comparison.identical ? "default" : "destructive"}>
                  {comparison.identical ? "identical evidence" : "CRM changed since capture"}
                </Badge>
              </CardTitle>
              <CardDescription>
                Metadata-level comparison — interpreting drift is the rule engine&apos;s job, not
                this page&apos;s.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {comparison.drift.length > 0 && (
                <ul className="m-0 list-disc space-y-1 pl-5">
                  {comparison.drift.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                      <th className="py-2 pr-3">Side</th>
                      <th className="py-2 pr-3">Retrieved</th>
                      <th className="py-2 pr-3">Connector</th>
                      <th className="py-2 pr-3">T / I / A</th>
                      <th className="py-2">Evidence hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["Snapshot", comparison.snapshot],
                        ["Live", comparison.live],
                      ] as const
                    ).map(([label, side]) => (
                      <tr key={label} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{label}</td>
                        <td className="py-2 pr-3">{new Date(side.retrievedAt).toLocaleString()}</td>
                        <td className="py-2 pr-3 font-mono text-xs">
                          {side.connectorKind} · {side.selectorVersion}
                        </td>
                        <td className="py-2 pr-3">
                          {side.counts.treatments} / {side.counts.invoices} / {side.counts.activity}
                        </td>
                        <td className="py-2 font-mono text-xs">{side.evidenceHash.slice(0, 16)}…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {snapshot && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Evidence snapshot — {snapshot.record.patient.fullName}
              </CardTitle>
              <CardDescription>
                Captured {new Date(snapshot.metadata.createdAt).toLocaleString()} via{" "}
                {snapshot.metadata.connectorKind} ({snapshot.metadata.selectorVersion}) · retrieved{" "}
                {new Date(snapshot.metadata.retrievedAt).toLocaleString()} · format v
                {snapshot.metadata.snapshotVersion} · window{" "}
                {snapshot.metadata.window
                  ? `${snapshot.metadata.window.from} → ${snapshot.metadata.window.to}`
                  : "full history"}{" "}
                · hash <code className="font-mono">{snapshot.metadata.contentHash.slice(0, 16)}…</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={compare}>
                  <GitCompareArrows aria-hidden="true" /> Compare vs live CRM
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={exportJson}>
                  <Download aria-hidden="true" /> Export JSON
                </Button>
              </div>
              <pre className="max-h-[55vh] overflow-auto rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed">
                {JSON.stringify(snapshot.record, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        {liveRecord && !snapshot && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Live CRM record — {liveRecord.patient.fullName}
              </CardTitle>
              <CardDescription>
                Preview only — nothing is stored until you create a snapshot.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[55vh] overflow-auto rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed">
                {JSON.stringify(liveRecord, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        {!snapshot && !liveRecord && !error && (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Search a patient, retrieve the live CRM, then seal the evidence as a snapshot — it
              appears here with its provenance and integrity hash.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
