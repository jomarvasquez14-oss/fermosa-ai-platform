"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Globe,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  ShieldAlert,
  Unplug,
  Wrench,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  browserDevCommandAction,
  connectorFetchRecordAction,
  connectorFindPatientsAction,
  type BrowserDevState,
} from "@/features/browser-dev/actions/browser-dev-actions";
import type { NavigablePageId } from "@/services/browser";
import type { FindPatientsResult, NormalizedCrmPatientRecord } from "@/services/crm";

const PAGES: NavigablePageId[] = [
  "dashboard",
  "patient-search",
  "patient-profile",
  "invoice",
  "activity-log",
];

export function BrowserDevScreen({ initialState }: { initialState: BrowserDevState }) {
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);

  // Connector cockpit (M0042 Phase 6)
  const [searchName, setSearchName] = useState("");
  const [searchMobile, setSearchMobile] = useState("");
  const [searchCrmId, setSearchCrmId] = useState("");
  const [connectorBusy, setConnectorBusy] = useState(false);
  const [connectorError, setConnectorError] = useState<{ message: string; code?: string } | null>(
    null
  );
  const [findResult, setFindResult] = useState<FindPatientsResult | null>(null);
  const [record, setRecord] = useState<NormalizedCrmPatientRecord | null>(null);

  async function command(input: Parameters<typeof browserDevCommandAction>[0]) {
    setBusy(true);
    try {
      setState(await browserDevCommandAction(input));
    } finally {
      setBusy(false);
    }
  }

  async function searchPatients() {
    setConnectorBusy(true);
    setConnectorError(null);
    setFindResult(null);
    setRecord(null);
    try {
      const result = await connectorFindPatientsAction({
        name: searchName || undefined,
        mobileNo: searchMobile || undefined,
        crmId: searchCrmId || undefined,
      });
      if (!result.ok) {
        setConnectorError({ message: result.error, code: result.code });
        return;
      }
      setFindResult(result.data);
    } finally {
      setConnectorBusy(false);
    }
  }

  async function openPatient(crmId: string) {
    setConnectorBusy(true);
    setConnectorError(null);
    try {
      const result = await connectorFetchRecordAction(crmId);
      if (!result.ok) {
        setConnectorError({ message: result.error, code: result.code });
        return;
      }
      setRecord(result.data);
    } finally {
      setConnectorBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      {/* ---- Controls ---- */}
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-4" aria-hidden="true" />
              Session
            </CardTitle>
            <CardDescription>
              Session, navigation, and failure drills run on the mock driver. The CRM connector
              health probe uses whichever connector <code>CRM_CONNECTOR</code> selects (
              {initialState.connector.kind}).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => command({ kind: "login" })}
            >
              Login
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => command({ kind: "logout" })}
            >
              <LogOut aria-hidden="true" /> Logout
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => command({ kind: "health" })}
            >
              Health check
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => command({ kind: "crm-health" })}
            >
              CRM connector health
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="size-4" aria-hidden="true" />
              Navigate
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {PAGES.map((page) => (
              <Button
                key={page}
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => command({ kind: "navigate", page })}
              >
                {page}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="size-4" aria-hidden="true" />
              CRM connector — {state.connector.kind}
            </CardTitle>
            <CardDescription>
              Runs through <code className="font-mono text-xs">getCRMConnector()</code>. With{" "}
              <code className="font-mono text-xs">CRM_CONNECTOR=playwright</code> this drives the
              live CRM (read-only) — the supervised validation cockpit.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5 text-xs">
              {(
                [
                  ["CRM_URL", state.connector.credentials.url],
                  ["CRM_USERNAME", state.connector.credentials.username],
                  ["CRM_PASSWORD", state.connector.credentials.password],
                ] as const
              ).map(([name, present]) => (
                <Badge key={name} variant={present ? "default" : "outline"}>
                  {name} {present ? "set" : "missing"}
                </Badge>
              ))}
            </div>
            {!state.connector.ready && (
              <p className="text-xs text-muted-foreground">
                The browser-automation connector cannot launch until every variable above is set in{" "}
                <code className="font-mono">.env</code>.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="connector-name">Name</Label>
              <Input
                id="connector-name"
                value={searchName}
                placeholder="Last, First — or a fragment"
                onChange={(event) => setSearchName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void searchPatients();
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="connector-mobile">Mobile</Label>
                <Input
                  id="connector-mobile"
                  value={searchMobile}
                  placeholder="0917…"
                  onChange={(event) => setSearchMobile(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="connector-crmid">CRM ID</Label>
                <Input
                  id="connector-crmid"
                  value={searchCrmId}
                  placeholder="e.g. 1001"
                  onChange={(event) => setSearchCrmId(event.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              disabled={connectorBusy}
              onClick={() => void searchPatients()}
            >
              {connectorBusy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Search aria-hidden="true" />
              )}
              Search patients
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="size-4" aria-hidden="true" />
              Failure simulation
            </CardTitle>
            <CardDescription>
              Arm a failure, then act — watch the framework absorb or surface it.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => command({ kind: "expire-session" })}
            >
              <Unplug aria-hidden="true" /> Expire session
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => command({ kind: "network-failures", count: 2 })}
            >
              2 network failures
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => command({ kind: "network-failures", count: 5 })}
            >
              5 network failures
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => command({ kind: "captcha", enabled: true })}
            >
              <ShieldAlert aria-hidden="true" /> Arm CAPTCHA
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => command({ kind: "break-layout", path: "/invoice" })}
            >
              Break invoice layout
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => command({ kind: "reset" })}
            >
              <RefreshCw aria-hidden="true" /> Reset mock CRM
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ---- State ---- */}
      <div className="flex min-w-0 flex-col gap-4">
        {state.lastError ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>{state.lastError.code}</AlertTitle>
            <AlertDescription>{state.lastError.message}</AlertDescription>
          </Alert>
        ) : state.lastResult ? (
          <Alert>
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>Result</AlertTitle>
            <AlertDescription>{state.lastResult}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(
            [
              { label: "Session", value: state.session },
              { label: "Login", value: state.driver.authenticated ? "authenticated" : "logged out" },
              { label: "Driver URL", value: state.driver.url },
              {
                label: "Flags",
                value:
                  [
                    state.driver.expired && "expired",
                    state.driver.captcha && "captcha",
                    state.driver.pendingNetworkFailures > 0 &&
                      `${state.driver.pendingNetworkFailures} net-fail`,
                    state.driver.brokenPaths.length > 0 && "layout-broken",
                  ]
                    .filter(Boolean)
                    .join(", ") || "healthy",
              },
              {
                label: "Connector",
                value: `${state.connector.kind}${state.connector.ready ? "" : " (unconfigured)"}`,
              },
              { label: "Selector version", value: state.registryVersion },
            ] as const
          ).map((stat) => (
            <Card key={stat.label} className="py-3">
              <CardContent className="px-4">
                <p className="text-xs text-muted-foreground uppercase">{stat.label}</p>
                <p className="truncate font-mono text-sm font-semibold">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {connectorError && (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>{connectorError.code ?? "Connector error"}</AlertTitle>
            <AlertDescription>{connectorError.message}</AlertDescription>
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
                        onClick={() => void openPatient(candidate.crmId)}
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
                {new Date(record.retrievedAt).toLocaleTimeString()} via {record.connectorKind} ·{" "}
                {record.sourceRef}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed">
                {JSON.stringify(record, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Navigation history</CardTitle>
          </CardHeader>
          <CardContent>
            {state.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No navigations yet.</p>
            ) : (
              <p className="font-mono text-sm">{state.history.join(" → ")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Ban className="size-4" aria-hidden="true" />
              Selector registry — {state.registryVersion}
            </CardTitle>
            <CardDescription>
              Selectors live here, never in page objects: a CRM redesign is a new map version.
              Capabilities:{" "}
              {Object.entries(state.capabilities).map(([name, enabled]) => (
                <Badge key={name} className="mr-1" variant={enabled ? "default" : "outline"}>
                  {name} {enabled ? "enabled" : "disabled"}
                </Badge>
              ))}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                  <th className="py-2 pr-3">Page object</th>
                  <th className="py-2 pr-3">Path</th>
                  <th className="py-2 pr-3">Verified</th>
                  <th className="py-2 pr-3">Fingerprint</th>
                  <th className="py-2">Element keys</th>
                </tr>
              </thead>
              <tbody>
                {state.registry.map((row) => (
                  <tr key={row.page} className="border-b align-top last:border-0">
                    <td className="py-2 pr-3 font-medium">{row.page}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{row.path}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={row.verification === "unverified" ? "destructive" : "secondary"}>
                        {row.verification}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline">{row.fingerprint} selectors</Badge>
                    </td>
                    <td className="py-2 font-mono text-xs">{row.elements.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
