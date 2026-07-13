"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OCRField } from "./ocr-field";
import { REVIEW_FIELD_KEYS, type ReviewFieldKey, type ReviewPage } from "./types";

interface OCRReviewPanelProps {
  page: ReviewPage;
  onAccept: (lineNumber: number, key: ReviewFieldKey) => void;
  onEdit: (lineNumber: number, key: ReviewFieldKey, value: string) => void;
  onMarkUnreadable: (lineNumber: number, key: ReviewFieldKey) => void;
  onReset: (lineNumber: number, key: ReviewFieldKey) => void;
}

/**
 * All extracted entries for one page, one card per logbook line, each field
 * individually reviewable. Confirmed pages render read-only.
 */
export function OCRReviewPanel({
  page,
  onAccept,
  onEdit,
  onMarkUnreadable,
  onReset,
}: OCRReviewPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      {page.unreadableRegions.length > 0 && (
        <Alert>
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>The model reported unreadable regions on this page</AlertTitle>
          <AlertDescription>
            {page.unreadableRegions
              .map((region) => `line ${region.lineNumber ?? "?"}: ${region.reason}`)
              .join(" · ")}
          </AlertDescription>
        </Alert>
      )}

      {page.entries.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            OCR found no entries on this page. Confirm to record it as empty.
          </CardContent>
        </Card>
      )}

      <ol
        aria-label={`Extracted entries for page ${page.pageNumber}`}
        className="m-0 list-none space-y-4 p-0"
      >
        {page.entries.map((entry) => (
          <li key={entry.lineNumber}>
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="font-mono text-sm text-muted-foreground tabular-nums">
                  Line {entry.lineNumber}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {REVIEW_FIELD_KEYS.map((key) => (
                  <OCRField
                    key={key}
                    field={entry.fields[key]}
                    disabled={page.confirmed}
                    onAccept={() => onAccept(entry.lineNumber, key)}
                    onEdit={(value) => onEdit(entry.lineNumber, key, value)}
                    onMarkUnreadable={() => onMarkUnreadable(entry.lineNumber, key)}
                    onReset={() => onReset(entry.lineNumber, key)}
                  />
                ))}
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
