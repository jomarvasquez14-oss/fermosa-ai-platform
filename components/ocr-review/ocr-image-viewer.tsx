"use client";

import { useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ZOOMS = [1, 1.5, 2, 3] as const;

/**
 * Original evidence beside the extraction. Zoom is view-only; the stored
 * image is never modified (DOMAIN_MODEL: submitted evidence is immutable).
 */
export function OCRImageViewer({
  src,
  alt,
  pageNumber,
  className,
}: {
  src: string;
  alt: string;
  pageNumber: number;
  className?: string;
}) {
  const [zoomIndex, setZoomIndex] = useState(0);
  const zoom = ZOOMS[zoomIndex] ?? 1;

  return (
    <figure className={cn("overflow-hidden rounded-xl border bg-muted/30", className)}>
      <div className="flex items-center justify-between gap-2 border-b bg-background/60 px-3 py-2">
        <Badge variant="secondary">Page {pageNumber}</Badge>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Zoom out"
            disabled={zoomIndex === 0}
            onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
          >
            <ZoomOut aria-hidden="true" />
          </Button>
          <span className="w-12 text-center font-mono text-xs text-muted-foreground tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Zoom in"
            disabled={zoomIndex === ZOOMS.length - 1}
            onClick={() => setZoomIndex((index) => Math.min(ZOOMS.length - 1, index + 1))}
          >
            <ZoomIn aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        {/* Access-controlled evidence served by /api/images — not optimizable. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          style={{ width: `${zoom * 100}%` }}
          className="max-w-none transition-[width] duration-150 motion-reduce:transition-none"
        />
      </div>
    </figure>
  );
}
