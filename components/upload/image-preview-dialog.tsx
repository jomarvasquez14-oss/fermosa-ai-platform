"use client";

import { useEffect, useState } from "react";
import { ImageOff, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/utils/format";
import type { ImageRotation, UploadImageItem } from "./types";

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 3, 4] as const;
const DEFAULT_ZOOM_INDEX = 2; // 1x

interface ImagePreviewDialogProps {
  /** The image to preview, or null when the dialog is closed. */
  image: UploadImageItem | null;
  pageNumber: number | null;
  onOpenChange: (open: boolean) => void;
  /** Persist a rotation performed inside the preview back to the batch. */
  onRotate: (id: string) => void;
}

/**
 * Full-screen preview with zoom and visual-only rotation.
 * Zoom is local to the dialog; rotation is propagated to the batch so the
 * card thumbnail matches what the user saw here.
 */
export function ImagePreviewDialog({
  image,
  pageNumber,
  onOpenChange,
  onRotate,
}: ImagePreviewDialogProps) {
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);

  // Reset zoom whenever a different image is opened.
  useEffect(() => {
    setZoomIndex(DEFAULT_ZOOM_INDEX);
  }, [image?.id]);

  const zoom = ZOOM_LEVELS[zoomIndex] ?? 1;
  const rotation: ImageRotation = image?.rotation ?? 0;

  return (
    <Dialog open={image !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none">
        {image && (
          <>
            <DialogHeader className="border-b px-4 py-3 pr-14 text-left">
              <DialogTitle className="truncate text-base">
                {pageNumber !== null ? `Page ${pageNumber} — ` : ""}
                {image.fileName}
              </DialogTitle>
              <DialogDescription>
                {formatFileSize(image.sizeBytes)} · zoom and rotate only — the original photo is not
                modified
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-auto bg-muted/40">
              <div className="flex min-h-full min-w-full items-center justify-center p-4">
                {image.previewable ? (
                  // Ephemeral blob: URL — next/image cannot optimize object URLs.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.previewUrl}
                    alt={`Full preview of ${image.fileName}`}
                    style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                    className={cn(
                      "max-h-[70dvh] max-w-full object-contain transition-transform duration-200"
                    )}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <ImageOff className="size-12" aria-hidden="true" />
                    <p className="max-w-sm text-center text-sm">
                      This browser cannot display this image format (likely HEIC). The file is still
                      part of your batch.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div
              role="toolbar"
              aria-label="Preview controls"
              className="flex items-center justify-center gap-2 border-t bg-background px-4 py-3"
            >
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Zoom out"
                disabled={!image.previewable || zoomIndex === 0}
                onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
              >
                <ZoomOut aria-hidden="true" />
              </Button>
              <span
                aria-live="polite"
                className="min-w-14 text-center text-sm text-muted-foreground tabular-nums"
              >
                {Math.round(zoom * 100)}%
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Zoom in"
                disabled={!image.previewable || zoomIndex === ZOOM_LEVELS.length - 1}
                onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
              >
                <ZoomIn aria-hidden="true" />
              </Button>
              <div className="mx-2 h-6 w-px bg-border" aria-hidden="true" />
              <Button
                type="button"
                variant="outline"
                aria-label={`Rotate ${image.fileName} 90 degrees`}
                disabled={!image.previewable}
                onClick={() => onRotate(image.id)}
              >
                <RotateCw aria-hidden="true" />
                Rotate
              </Button>
              <Button type="button" variant="default" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
