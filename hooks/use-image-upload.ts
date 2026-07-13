"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageRotation, UploadImageItem, UploadRejection } from "@/components/upload/types";
import { toRejection, validateFiles } from "@/components/upload/validation";

/**
 * State for a client-side upload batch (Sprint 2A.1: ephemeral by design).
 *
 * Owns the object-URL lifecycle: URLs are created when files are accepted and
 * revoked on removal/clear/unmount so a long session never leaks memory.
 * No persistence — the batch dies with the page.
 *
 * Implementation note: mutations compute the next array from a write-through
 * ref and pass the RESULT to setState. Doing work inside functional updaters
 * is not an option here — adding files has side effects (object-URL creation,
 * rejection reporting), and React StrictMode double-invokes updaters, which
 * would duplicate both.
 */
export function useImageUpload(initialImages: UploadImageItem[] = []) {
  const [images, setImages] = useState<UploadImageItem[]>(initialImages);
  const [rejections, setRejections] = useState<UploadRejection[]>([]);
  /** Always-current mirror of `images`; single source of truth for mutations. */
  const imagesRef = useRef<UploadImageItem[]>(initialImages);
  // Tracked separately so unmount cleanup sees every URL ever created.
  const urlsRef = useRef(new Set<string>());

  const commit = useCallback((next: UploadImageItem[]) => {
    imagesRef.current = next;
    setImages(next);
  }, []);

  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const addFiles = useCallback(
    (candidates: readonly File[]) => {
      const current = imagesRef.current;
      const { accepted, rejected } = validateFiles(candidates, current);
      const newRejections = rejected.map((r) => toRejection(r.file.name, r.reason, r.message));

      const additions: UploadImageItem[] = [];
      for (const file of accepted) {
        try {
          const previewUrl = URL.createObjectURL(file);
          urlsRef.current.add(previewUrl);
          additions.push({
            id: crypto.randomUUID(),
            file,
            previewUrl,
            fileName: file.name,
            sizeBytes: file.size,
            rotation: 0,
            previewable: true,
            uploadState: "staged",
          });
        } catch {
          newRejections.push(toRejection(file.name, "read-failure"));
        }
      }

      if (additions.length > 0) commit([...current, ...additions]);
      if (newRejections.length > 0) setRejections((prev) => [...prev, ...newRejections]);
    },
    [commit]
  );

  const removeImage = useCallback(
    (id: string) => {
      const current = imagesRef.current;
      const target = current.find((item) => item.id === id);
      if (!target) return;
      if (urlsRef.current.has(target.previewUrl)) {
        URL.revokeObjectURL(target.previewUrl);
        urlsRef.current.delete(target.previewUrl);
      }
      commit(current.filter((item) => item.id !== id));
    },
    [commit]
  );

  /** Patch a single item (upload progress, server id assignment, ...). */
  const updateImage = useCallback(
    (id: string, patch: Partial<UploadImageItem>) => {
      commit(imagesRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    },
    [commit]
  );

  const clearAll = useCallback(() => {
    for (const item of imagesRef.current) {
      URL.revokeObjectURL(item.previewUrl);
      urlsRef.current.delete(item.previewUrl);
    }
    commit([]);
    setRejections([]);
  }, [commit]);

  /** Visual-only 90° clockwise rotation (CSS transform, file untouched). */
  const rotateImage = useCallback(
    (id: string) => {
      commit(
        imagesRef.current.map((item) =>
          item.id === id
            ? { ...item, rotation: ((item.rotation + 90) % 360) as ImageRotation }
            : item
        )
      );
    },
    [commit]
  );

  /** Move an image one position up (-1) or down (+1) in page order. */
  const moveImage = useCallback(
    (id: string, direction: -1 | 1) => {
      const current = imagesRef.current;
      const index = current.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.length) return;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (!moved) return;
      next.splice(target, 0, moved);
      commit(next);
    },
    [commit]
  );

  /** Mark an image as not renderable by this browser (e.g. HEIC on Chrome). */
  const markUnpreviewable = useCallback(
    (id: string) => {
      commit(
        imagesRef.current.map((item) => (item.id === id ? { ...item, previewable: false } : item))
      );
    },
    [commit]
  );

  const dismissRejection = useCallback((id: string) => {
    setRejections((current) => current.filter((r) => r.id !== id));
  }, []);

  const clearRejections = useCallback(() => setRejections([]), []);

  return {
    images,
    rejections,
    addFiles,
    removeImage,
    updateImage,
    clearAll,
    rotateImage,
    moveImage,
    markUnpreviewable,
    dismissRejection,
    clearRejections,
  };
}

export type UseImageUploadReturn = ReturnType<typeof useImageUpload>;
