"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/utils/format";
import type { UploadImageItem } from "./types";
import { MAX_IMAGES } from "./validation";

interface UploadToolbarProps {
  images: readonly UploadImageItem[];
  onClearAll: () => void;
}

/** Batch summary bar: image count, total size, and clear-all. */
export function UploadToolbar({ images, onClearAll }: UploadToolbarProps) {
  if (images.length === 0) return null;

  const totalBytes = images.reduce((sum, item) => sum + item.sizeBytes, 0);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {images.length} of {MAX_IMAGES}
        </span>{" "}
        image{images.length === 1 ? "" : "s"} · {formatFileSize(totalBytes)} total
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={onClearAll}
      >
        <Trash2 aria-hidden="true" />
        Clear all
      </Button>
    </div>
  );
}
