"use client";

import { AlertCircle, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { UploadRejection } from "./types";

interface UploadRejectionsProps {
  rejections: readonly UploadRejection[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}

/**
 * Friendly, dismissible list of files that could not be added.
 * Rendered as role="alert" so screen readers announce new rejections.
 */
export function UploadRejections({ rejections, onDismiss, onDismissAll }: UploadRejectionsProps) {
  if (rejections.length === 0) return null;

  return (
    <Alert variant="destructive" role="alert">
      <AlertCircle aria-hidden="true" />
      <AlertTitle className="flex items-center justify-between gap-2">
        <span>
          {rejections.length === 1
            ? "One file could not be added"
            : `${rejections.length} files could not be added`}
        </span>
        {rejections.length > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-my-1 h-7 shrink-0 px-2 font-normal"
            onClick={onDismissAll}
          >
            Dismiss all
          </Button>
        )}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-1 w-full list-none space-y-1 p-0">
          {rejections.map((rejection) => (
            <li key={rejection.id} className="flex items-start justify-between gap-2">
              <span className="min-w-0 text-sm break-words">{rejection.message}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Dismiss message about ${rejection.fileName}`}
                className="size-6 shrink-0"
                onClick={() => onDismiss(rejection.id)}
              >
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
