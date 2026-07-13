"use client";

import { useId, useState } from "react";
import { Ban, Check, Pencil, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "./confidence-badge";
import { bandFor } from "./confidence";
import { REVIEW_FIELD_LABELS, type ReviewField } from "./types";

interface OCRFieldProps {
  field: ReviewField;
  disabled?: boolean;
  onAccept: () => void;
  onEdit: (value: string) => void;
  onMarkUnreadable: () => void;
  onReset: () => void;
}

/**
 * One extracted field under review: value, confidence, and the three verdicts
 * (accept / edit / unreadable). Fields below the auto-accept threshold are
 * visually highlighted by band; resolved fields show their verdict.
 */
export function OCRField({
  field,
  disabled = false,
  onAccept,
  onEdit,
  onMarkUnreadable,
  onReset,
}: OCRFieldProps) {
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(field.value ?? "");

  const band = bandFor(field.confidence);
  const resolved = field.status !== "pending";
  const label = REVIEW_FIELD_LABELS[field.key];

  function commitEdit() {
    const next = draft.trim();
    if (next.length === 0) return;
    onEdit(next);
    setEditing(false);
  }

  return (
    <div
      data-status={field.status}
      className={cn(
        "rounded-lg border p-3",
        !resolved && band === "review" && "border-amber-500/60 bg-amber-500/5",
        !resolved && band === "manual" && "border-destructive/60 bg-destructive/5",
        resolved && "border-border bg-muted/30"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground uppercase">
          {label}
        </label>
        <span className="flex items-center gap-1.5">
          {field.status === "edited" && (
            <span className="text-xs text-muted-foreground italic">edited</span>
          )}
          {field.status === "accepted" && (
            <Check className="size-3.5 text-emerald-600" aria-label="Accepted" />
          )}
          {field.status === "unreadable" && (
            <Ban className="size-3.5 text-destructive" aria-label="Marked unreadable" />
          )}
          <ConfidenceBadge value={field.confidence} />
        </span>
      </div>

      <div className="mt-1.5">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              id={inputId}
              value={draft}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitEdit();
                if (event.key === "Escape") setEditing(false);
              }}
              className="h-9"
            />
            <Button type="button" size="sm" onClick={commitEdit} disabled={!draft.trim()}>
              Save
            </Button>
          </div>
        ) : (
          <p
            id={inputId}
            className={cn(
              "min-h-6 text-sm font-medium",
              (field.value === null || field.status === "unreadable") && "text-destructive italic"
            )}
          >
            {field.status === "unreadable"
              ? "Unreadable (confirmed)"
              : (field.value ?? "— not read —")}
          </p>
        )}
        {field.status === "edited" && field.originalValue !== null && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            OCR read: <span className="line-through">{field.originalValue}</span>
          </p>
        )}
      </div>

      {!editing && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {!resolved && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={disabled || field.value === null}
                aria-label={`Accept ${label}`}
                onClick={onAccept}
              >
                <Check aria-hidden="true" />
                Accept
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={disabled}
                aria-label={`Edit ${label}`}
                onClick={() => {
                  setDraft(field.value ?? "");
                  setEditing(true);
                }}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-destructive hover:text-destructive"
                disabled={disabled}
                aria-label={`Mark ${label} unreadable`}
                onClick={onMarkUnreadable}
              >
                <Ban aria-hidden="true" />
                Unreadable
              </Button>
            </>
          )}
          {resolved && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              disabled={disabled}
              aria-label={`Undo decision on ${label}`}
              onClick={() => {
                setEditing(false);
                onReset();
              }}
            >
              <Undo2 aria-hidden="true" />
              Undo
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
