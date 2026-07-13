"use client";

import { ImageCard } from "./image-card";
import type { UploadImageItem } from "./types";

interface ImageSorterProps {
  images: readonly UploadImageItem[];
  onPreview: (id: string) => void;
  onDelete: (id: string) => void;
  onRotate: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onPreviewError: (id: string) => void;
  onRetry?: (id: string) => void;
}

/**
 * Ordered, responsive grid of staged images. Order = page order; moving a
 * card renumbers pages automatically. Announced as a list for screen readers.
 */
export function ImageSorter({
  images,
  onPreview,
  onDelete,
  onRotate,
  onMove,
  onPreviewError,
  onRetry,
}: ImageSorterProps) {
  if (images.length === 0) return null;

  return (
    <ul
      aria-label={`Uploaded images, ${images.length} in page order`}
      className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {images.map((image, index) => (
        <li key={image.id}>
          <ImageCard
            image={image}
            pageNumber={index + 1}
            totalImages={images.length}
            onPreview={onPreview}
            onDelete={onDelete}
            onRotate={onRotate}
            onMoveUp={(id) => onMove(id, -1)}
            onMoveDown={(id) => onMove(id, 1)}
            onPreviewError={onPreviewError}
            onRetry={onRetry}
          />
        </li>
      ))}
    </ul>
  );
}
