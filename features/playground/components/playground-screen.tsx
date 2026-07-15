"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, Loader2, Play, X } from "lucide-react";
import { ConfidenceBadge } from "@/components/ocr-review";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { FILE_INPUT_ACCEPT } from "@/components/upload/validation";
import {
  runPlaygroundOcrAction,
  type PlaygroundRunResult,
} from "@/features/playground/actions/run-ocr-action";
import { formatFileSize } from "@/utils/format";

/** Serializable catalogs passed from the server page. */
export interface PlaygroundCatalog {
  providers: Array<{
    id: string;
    label: string;
    implemented: boolean;
    models: Array<{ id: string; label: string; description?: string }>;
  }>;
  prompts: Array<{ id: string; description: string; draft: boolean }>;
}

type RunData = Extract<PlaygroundRunResult, { ok: true }>["data"];

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

function FieldCell({
  field,
}: {
  field: { value: string | null; confidence: number; unreadable: boolean };
}) {
  if (field.unreadable || field.value === null) {
    return <span className="text-destructive italic">unreadable</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {field.value} <ConfidenceBadge value={field.confidence} />
    </span>
  );
}

export function PlaygroundScreen({ catalog }: { catalog: PlaygroundCatalog }) {
  const [providerId, setProviderId] = useState(
    catalog.providers.find((p) => p.implemented)?.id ?? ""
  );
  const provider = catalog.providers.find((p) => p.id === providerId);
  const [model, setModel] = useState(provider?.models[0]?.id ?? "");
  const [promptId, setPromptId] = useState(catalog.prompts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function selectFile(next: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(next);
    setPreviewUrl(next ? URL.createObjectURL(next) : null);
    setResult(null);
    setError(null);
  }

  function onProviderChange(id: string) {
    setProviderId(id);
    const nextProvider = catalog.providers.find((p) => p.id === id);
    setModel(nextProvider?.models[0]?.id ?? "");
  }

  async function run() {
    if (!file) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("provider", providerId);
      formData.set("model", model);
      formData.set("promptVersion", promptId);
      const response = await runPlaygroundOcrAction(formData);
      if (response.ok) setResult(response.data);
      else setError(response.error);
    } finally {
      setRunning(false);
    }
  }

  const selectedModel = provider?.models.find((entry) => entry.id === model);
  const parsedJson = useMemo(
    () => (result?.extraction ? JSON.stringify(result.extraction, null, 2) : null),
    [result]
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      {/* ---- Configuration column ---- */}
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="size-4" aria-hidden="true" />
              Run configuration
            </CardTitle>
            <CardDescription>
              Executes through the same <code className="font-mono text-xs">AIProvider</code> seam
              production will use. Nothing is persisted.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="pg-provider">Provider</Label>
              <select
                id="pg-provider"
                className={selectClass}
                value={providerId}
                disabled={running}
                onChange={(event) => onProviderChange(event.target.value)}
              >
                {catalog.providers.map((entry) => (
                  <option key={entry.id} value={entry.id} disabled={!entry.implemented}>
                    {entry.label}
                    {entry.implemented ? "" : " — not implemented"}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pg-model">Model</Label>
              <select
                id="pg-model"
                className={selectClass}
                value={model}
                disabled={running}
                onChange={(event) => setModel(event.target.value)}
              >
                {(provider?.models ?? []).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
              {selectedModel?.description && (
                <p className="text-xs text-muted-foreground">{selectedModel.description}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pg-prompt">Prompt version</Label>
              <select
                id="pg-prompt"
                className={selectClass}
                value={promptId}
                disabled={running}
                onChange={(event) => setPromptId(event.target.value)}
              >
                {catalog.prompts.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.id}
                    {entry.draft ? " (draft)" : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {catalog.prompts.find((entry) => entry.id === promptId)?.description}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pg-image">Image</Label>
              <input
                ref={fileInputRef}
                id="pg-image"
                type="file"
                accept={FILE_INPUT_ACCEPT}
                disabled={running}
                className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
                onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
              />
            </div>

            {file && previewUrl && (
              <div className="relative overflow-hidden rounded-lg border">
                {/* Local object URL preview — next/image cannot optimize blob: URLs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt={file.name} className="max-h-56 w-full object-contain" />
                <div className="flex items-center justify-between gap-2 border-t bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                  <span className="truncate">
                    {file.name} · {formatFileSize(file.size)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label="Remove image"
                    onClick={() => {
                      selectFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}

            <Button type="button" disabled={!file || running} onClick={() => void run()}>
              {running ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Play aria-hidden="true" />
              )}
              {running ? "Running…" : "Execute OCR"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ---- Results column ---- */}
      <div className="flex min-w-0 flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Run failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!result && !error && (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Configure a run and execute — raw response, parsed JSON, validation, timing, and cost
              appear here.
            </CardContent>
          </Card>
        )}

        {result && (
          <>
            {/* Execution metadata */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { label: "Latency", value: `${result.meta.latencyMs} ms` },
                { label: "Input tokens", value: result.meta.usage?.inputTokens ?? "—" },
                { label: "Output tokens", value: result.meta.usage?.outputTokens ?? "—" },
                {
                  label: "Est. cost",
                  value:
                    result.meta.usage != null
                      ? `$${result.meta.usage.estimatedCostUsd.toFixed(6)}`
                      : "—",
                },
                { label: "Model", value: result.meta.model },
              ].map((stat) => (
                <Card key={stat.label} className="py-3">
                  <CardContent className="px-4">
                    <p className="text-xs text-muted-foreground uppercase">{stat.label}</p>
                    <p className="truncate font-mono text-sm font-semibold tabular-nums">
                      {stat.value}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Validation */}
            {result.validation.valid ? (
              <Alert>
                <CheckCircle2 aria-hidden="true" />
                <AlertTitle>Schema valid</AlertTitle>
                <AlertDescription>
                  Response conforms to OcrPageExtraction v1 (
                  {result.extraction?.entries.length ?? 0} entries, page confidence{" "}
                  {result.extraction ? result.extraction.pageConfidence.toFixed(2) : "—"}).
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>
                  Schema validation failed ({result.validation.issues.length} issue
                  {result.validation.issues.length === 1 ? "" : "s"})
                </AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4 font-mono text-xs">
                    {result.validation.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Extracted entries (only when valid) */}
            {result.extraction && result.extraction.entries.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Extracted entries</CardTitle>
                  <CardDescription>
                    Confidence bands: <Badge variant="outline">≥ 0.95 auto-accept</Badge>{" "}
                    <Badge variant="outline">0.80–0.94 review</Badge>{" "}
                    <Badge variant="outline">&lt; 0.80 manual</Badge>
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                        <th className="py-2 pr-3">#</th>
                        <th className="py-2 pr-3">Patient</th>
                        <th className="py-2 pr-3">Services</th>
                        <th className="py-2 pr-3">Staff</th>
                        <th className="py-2 pr-3">Time in</th>
                        <th className="py-2">Entry conf.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.extraction.entries.map((entry) => (
                        <tr key={entry.lineNumber} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono tabular-nums">{entry.lineNumber}</td>
                          <td className="py-2 pr-3">
                            <FieldCell field={entry.patientName} />
                          </td>
                          <td className="py-2 pr-3">
                            {entry.services.length > 0 ? (
                              <span className="inline-flex items-center gap-1">
                                <FieldCell field={entry.services[0]!.name} />
                                {entry.services.length > 1 && (
                                  <span className="text-xs text-muted-foreground">
                                    +{entry.services.length - 1}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <FieldCell field={entry.staff} />
                          </td>
                          <td className="py-2 pr-3">
                            <FieldCell field={entry.timeIn} />
                          </td>
                          <td className="py-2">
                            <ConfidenceBadge value={entry.entryConfidence} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.extraction.unreadableRegions.length > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Unreadable regions:{" "}
                      {result.extraction.unreadableRegions
                        .map((region) => `line ${region.lineNumber ?? "?"} (${region.reason})`)
                        .join(", ")}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Parsed JSON */}
            {parsedJson && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Parsed JSON</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-96 overflow-auto rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed">
                    {parsedJson}
                  </pre>
                </CardContent>
              </Card>
            )}

            {/* Raw response — always shown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Raw provider response</CardTitle>
                <CardDescription>
                  Exactly what the provider returned, before validation — this is what gets
                  persisted as <code className="font-mono text-xs">OcrResult.rawText</code> in 3.x.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-96 overflow-auto rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed">
                  {result.rawResponse}
                </pre>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
