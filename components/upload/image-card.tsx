"use client";

import {
  ArrowDown,
  ArrowUp,
  Expand,
  ImageOff,
  Loader2,
  RefreshCw,
  RotateCw,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/utils/format";
import type { UploadImageItem } from "./types";

interface ImageCardProps {
  image: UploadImageItem;
  /** 1-based page number shown to the user (order in the batch). */
  pageNumber: number;
  totalImages: number;
  onPreview: (id: string) => void;
  onDelete: (id: string) => void;
  onRotate: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  /** Called when the browser cannot decode the image (e.g. HEIC on Chrome). */
  onPreviewError: (id: string) => void;
  /** Retry a failed upload — rendered only when provided and the item failed. */
  onRetry?: (id: string) => void;
}

/**
 * One staged logbook image: thumbnail, metadata, and per-image actions.
 * Rotation is CSS-only; the underlying file is never modified.
 */
export function ImageCard({
  image,
  pageNumber,
  totalImages,
  onPreview,
  onDelete,
  onRotate,
  onMoveUp,
  onMoveDown,
  onPreviewError,
  onRetry,
}: ImageCardProps) {
  const name = image.fileName;
  const isFirst = pageNumber === 1;
  const isLast = pageNumber === totalImages;

  return (
    <Card
      role="group"
      aria-label={`Page ${pageNumber} of ${totalImages}: ${name}`}
      className="gap-0 overflow-hidden p-0"
    >
      {/* Thumbnail — also a large touch target for preview. */}
      <button
        type="button"
        onClick={() => onPreview(image.id)}
        aria-label={`Preview ${name}`}
        className="group relative block aspect-[4/3] w-full overflow-hidden bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
      >
        {image.previewable ? (
          // Ephemeral blob: URL — next/image cannot optimize object URLs.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.previewUrl}
            alt={`Logbook page ${pageNumber}: ${name}`}
            onError={() => onPreviewError(image.id)}
            className={cn(
              "size-full object-contain transition-transform duration-200",
              image.rotation === 90 && "rotate-90",
              image.rotation === 180 && "rotate-180",
              image.rotation === 270 && "-rotate-90"
            )}
          />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageOff className="size-8" aria-hidden="true" />
            <span className="px-2 text-xs">Preview not supported in this browser</span>
          </span>
        )}
        <Badge variant="secondary" aria-hidden="true" className="absolute top-2 left-2 shadow-sm">
          Page {pageNumber}
        </Badge>
        {image.uploadState === "uploading" && (
          <Badge className="absolute top-2 right-2 shadow-sm" aria-hidden="true">
            <Loader2 className="animate-spin" aria-hidden="true" />
            Uploading
          </Badge>
        )}
        {image.uploadState === "failed" && (
          <Badge variant="destructive" className="absolute top-2 right-2 shadow-sm">
            Upload failed
          </Badge>
        )}
        <span className="absolute inset-0 hidden items-center justify-center bg-black/40 group-hover:flex group-focus-visible:flex">
          <Expand className="size-6 text-white" aria-hidden="true" />
        </span>
      </button>

      <div className="space-y-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={name}>
            {name}
          </p>
          <p className="text-xs text-muted-foreground">{formatFileSize(image.sizeBytes)}</p>
        </div>

        {/* size-11 on touch layouts (44px minimum target), tighter on lg+. */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 lg:size-9"
              aria-label={`Move ${name} up (currently page ${pageNumber})`}
              disabled={isFirst}
              onClick={() => onMoveUp(image.id)}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 lg:size-9"
              aria-label={`Move ${name} down (currently page ${pageNumber})`}
              disabled={isLast}
              onClick={() => onMoveDown(image.id)}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 lg:size-9"
              aria-label={`Rotate ${name} 90 degrees`}
              disabled={!image.previewable}
              onClick={() => onRotate(image.id)}
            >
              <RotateCw aria-hidden="true" />
            </Button>
            {image.uploadState === "failed" && onRetry && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 lg:size-9"
                aria-label={`Retry uploading ${name}`}
                onClick={() => onRetry(image.id)}
              >
                <RefreshCw aria-hidden="true" />
              </Button>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 text-destructive hover:text-destructive lg:size-9"
            aria-label={`Remove ${name} from the batch`}
            onClick={() => onDelete(image.id)}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
