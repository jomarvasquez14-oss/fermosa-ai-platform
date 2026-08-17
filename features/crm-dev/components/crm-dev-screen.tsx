"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Search, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchPatientRecordAction,
  findPatientsAction,
} from "@/features/crm-dev/actions/crm-dev-actions";
import type { FindPatientsResult, NormalizedCrmPatientRecord } from "@/services/crm";

/** Fixture directory + error triggers, passed from the server page. */
export interface CrmDevCatalog {
  fixtures: Array<{ crmId: string; fullName: string; scenario: string }>;
  errorTriggers: string[];
}

export function CrmDevScreen({ catalog }: { catalog: CrmDevCatalog }) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [findResult, setFindResult] = useState<FindPatientsResult | null>(null);
  const [record, setRecord] = useState<NormalizedCrmPatientRecord | null>(null);

  async function search() {
    setBusy(true);
    setError(null);
    setRecord(null);
    setFindResult(null);
    try {
      const result = await findPatientsAction({
        name: name || undefined,
        dob: dob || undefined,
        mobileNo: mobile || undefined,
      });
      if (!result.ok) {
        setError({ message: result.error, code: result.code });
        return;
      }
      setFindResult(result.data);
      if (result.data.outcome === "found") {
        await loadRecord(result.data.candidates[0]!.crmId);
      }
    } finally {
      setBusy(false);
    }
  }

  async function loadRecord(crmId: string) {
    setError(null);
    const result = await fetchPatientRecordAction(crmId);
    if (!result.ok) {
      setError({ message: result.error, code: result.code });
      return;
    }
    setRecord(result.data);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      {/* ---- Search + fixtures ---- */}
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="size-4" aria-hidden="true" />
              Patient lookup
            </CardTitle>
            <CardDescription>
              Runs through <code className="font-mono text-xs">getCRMConnector()</code> — the
              connector <code className="font-mono text-xs">CRM_CONNECTOR</code> selects (mock by
              default; the LIVE CRM when set to <code className="font-mono text-xs">playwright</code>
              ). The fixture directory below only exists on the mock.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="crm-name">Name</Label>
              <Input
                id="crm-name"
                value={name}
                placeholder="e.g. Cruz — or trigger:unavailable"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void search();
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="crm-dob">Date of birth</Label>
                <Input
                  id="crm-dob"
                  type="date"
                  value={dob}
                  onChange={(event) => setDob(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="crm-mobile">Mobile</Label>
                <Input
                  id="crm-mobile"
                  value={mobile}
                  placeholder="0917…"
                  onChange={(event) => setMobile(event.target.value)}
                />
              </div>
            </div>
            <Button type="button" disabled={busy} onClick={() => void search()}>
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Search aria-hidden="true" />
              )}
              Search
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" aria-hidden="true" />
              Fixture directory
            </CardTitle>
            <CardDescription>
              One patient per scenario. Error triggers:{" "}
              {catalog.errorTriggers.map((trigger) => (
                <code key={trigger} className="mr-1 font-mono text-xs">
                  {trigger}
                </code>
              ))}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="m-0 list-none space-y-1 p-0 text-sm">
              {catalog.fixtures.map((fixture) => (
                <li key={fixture.crmId}>
                  <button
                    type="button"
                    className="flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    onClick={() => void loadRecord(fixture.crmId)}
                  >
                    <span className="font-medium">{fixture.fullName}</span>
                    <span className="text-xs text-muted-foreground">{fixture.scenario}</span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* ---- Results ---- */}
      <div className="flex min-w-0 flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>{error.code ?? "Error"}</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

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
                  Multiple patients match — a human picks; the connector never auto-resolves.
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
                        className="flex w-full flex-wrap items-baseline gap-x-3 rounded-md px-2 py-1.5 text-left hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        onClick={() => void loadRecord(candidate.crmId)}
                      >
                        <span className="font-medium">{candidate.fullName}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {candidate.crmId}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          dob {candidate.dateOfBirth ?? "—"} · {candidate.mobileNo ?? "—"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>
        )}

        {record && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                NormalizedCrmPatientRecord — {record.patient.fullName}
              </CardTitle>
              <CardDescription>
                {record.treatments.length} treatment{record.treatments.length === 1 ? "" : "s"} ·{" "}
                {record.invoices.length} invoice{record.invoices.length === 1 ? "" : "s"} ·{" "}
                {record.activity.length} activity event
                {record.activity.length === 1 ? "" : "s"} · retrieved{" "}
                {new Date(record.retrievedAt).toLocaleTimeString()} via {record.connectorKind}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[70vh] overflow-auto rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed">
                {JSON.stringify(record, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        {!record && !findResult && !error && (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Search a patient or pick a fixture — the normalized JSON appears here.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
