"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Globe,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Unplug,
  Wrench,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  browserDevCommandAction,
  type BrowserDevState,
} from "@/features/browser-dev/actions/browser-dev-actions";
import type { PageId } from "@/services/browser";

const PAGES: PageId[] = [
  "dashboard",
  "patient-search",
  "patient-profile",
  "invoice",
  "activity-log",
];

export function BrowserDevScreen({ initialState }: { initialState: BrowserDevState }) {
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);

  async function command(input: Parameters<typeof browserDevCommandAction>[0]) {
    setBusy(true);
    try {
      setState(await browserDevCommandAction(input));
    } finally {
      setBusy(false);
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
              Mock CRM only — the framework&apos;s single driver implementation cannot reach the
              live system.
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              { label: "Session", value: state.session },
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
              { label: "Registry", value: state.registryVersion },
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
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                  <th className="py-2 pr-3">Page object</th>
                  <th className="py-2 pr-3">Path</th>
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
