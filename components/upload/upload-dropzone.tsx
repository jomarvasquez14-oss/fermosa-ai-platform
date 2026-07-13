"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, ImagePlus, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FILE_INPUT_ACCEPT, MAX_IMAGES } from "./validation";

interface UploadDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  /** Disable interaction, e.g. when the batch is full. */
  disabled?: boolean;
  /** Compact variant used below an existing batch ("add more"). */
  compact?: boolean;
  className?: string;
}

/**
 * Image intake surface: drag-and-drop (desktop), tap-to-browse, and a
 * dedicated camera-capture button for mobile browsers that support it.
 * Selection is delegated upward — this component holds no batch state.
 */
export function UploadDropzone({
  onFilesSelected,
  disabled = false,
  compact = false,
  className,
}: UploadDropzoneProps) {
  const browseInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  // Child drag events fire enter/leave in pairs; count to avoid flicker.
  const dragDepth = useRef(0);

  const emitFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      onFilesSelected(Array.from(list));
    },
    [onFilesSelected]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragActive(false);
      if (disabled) return;
      emitFiles(event.dataTransfer.files);
    },
    [disabled, emitFiles]
  );

  return (
    <div className={className}>
      {/* Hidden inputs: one regular picker, one forcing the camera on mobile. */}
      <input
        ref={browseInputRef}
        type="file"
        accept={FILE_INPUT_ACCEPT}
        multiple
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          emitFiles(event.target.files);
          event.target.value = ""; // allow re-selecting the same file after removal
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          emitFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={`Add logbook images. Accepted formats JPG, PNG, HEIC. Up to ${MAX_IMAGES} images, 10 megabytes each.`}
        onClick={() => !disabled && browseInputRef.current?.click()}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            browseInputRef.current?.click();
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          if (!disabled) setIsDragActive(true);
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setIsDragActive(false);
        }}
        onDrop={handleDrop}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/30 px-4 text-center transition-colors",
          compact ? "py-6" : "py-10 sm:py-14",
          "hover:border-primary/50 hover:bg-muted/50",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
          isDragActive && "border-primary bg-primary/5",
          disabled &&
            "cursor-not-allowed opacity-60 hover:border-muted-foreground/25 hover:bg-muted/30"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-background shadow-sm",
            compact ? "size-10" : "size-14"
          )}
        >
          {compact ? (
            <ImagePlus className="size-5 text-muted-foreground" aria-hidden="true" />
          ) : (
            <UploadCloud className="size-7 text-muted-foreground" aria-hidden="true" />
          )}
        </div>

        <div className="space-y-1">
          <p className={cn("font-medium", compact ? "text-sm" : "text-base")}>
            {isDragActive
              ? "Drop images here"
              : compact
                ? "Add more images"
                : "Drag and drop logbook images"}
          </p>
          <p className="text-xs text-muted-foreground sm:text-sm">
            or tap to browse · JPG, PNG, HEIC · up to {MAX_IMAGES} images, 10 MB each
          </p>
        </div>

        {/* Explicit buttons: large touch targets, and stopPropagation so they
            don't double-trigger the surrounding dropzone click. */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            size={compact ? "sm" : "default"}
            className={compact ? undefined : "h-11 px-5 lg:h-9"}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              browseInputRef.current?.click();
            }}
          >
            <ImagePlus aria-hidden="true" />
            Choose images
          </Button>
          <Button
            type="button"
            variant="outline"
            size={compact ? "sm" : "default"}
            className={compact ? "sm:hidden" : "h-11 px-5 sm:hidden"}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              cameraInputRef.current?.click();
            }}
          >
            <Camera aria-hidden="true" />
            Take photo
          </Button>
        </div>
      </div>
    </div>
  );
}
