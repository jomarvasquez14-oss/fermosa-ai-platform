"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AUTO_ACCEPT_THRESHOLD } from "@/components/ocr-review/confidence";
import {
  REVIEW_FIELD_KEYS,
  type ReviewFieldKey,
  type ReviewPage,
} from "@/components/ocr-review/types";

export { buildReviewPages } from "@/components/ocr-review/build-review-pages";

export interface ReviewProgress {
  pagesTotal: number;
  pagesConfirmed: number;
  fieldsTotal: number;
  fieldsResolved: number;
  autoAccepted: number;
  accepted: number;
  edited: number;
  unreadable: number;
  pending: number;
}

/**
 * Client state for an OCR review session (Sprint 3.3: ephemeral — persistence
 * of confirmed data arrives with OCR integration). Field decisions never
 * mutate `originalValue`; corrections live beside what the model read.
 */
export function useOcrReview(initialPages: ReviewPage[]) {
  const [pages, setPages] = useState<ReviewPage[]>(initialPages);
  const pagesRef = useRef(initialPages);

  const commit = useCallback((next: ReviewPage[]) => {
    pagesRef.current = next;
    setPages(next);
  }, []);

  const patchField = useCallback(
    (
      imageId: string,
      lineNumber: number,
      key: ReviewFieldKey,
      patch: Partial<ReviewPage["entries"][number]["fields"][ReviewFieldKey]>
    ) => {
      commit(
        pagesRef.current.map((page) =>
          page.imageId !== imageId || page.confirmed
            ? page
            : {
                ...page,
                entries: page.entries.map((entry) =>
                  entry.lineNumber !== lineNumber
                    ? entry
                    : {
                        ...entry,
                        fields: { ...entry.fields, [key]: { ...entry.fields[key], ...patch } },
                      }
                ),
              }
        )
      );
    },
    [commit]
  );

  const accept = useCallback(
    (imageId: string, lineNumber: number, key: ReviewFieldKey) =>
      patchField(imageId, lineNumber, key, { status: "accepted" }),
    [patchField]
  );

  const edit = useCallback(
    (imageId: string, lineNumber: number, key: ReviewFieldKey, value: string) =>
      patchField(imageId, lineNumber, key, { status: "edited", value }),
    [patchField]
  );

  const markUnreadable = useCallback(
    (imageId: string, lineNumber: number, key: ReviewFieldKey) =>
      patchField(imageId, lineNumber, key, { status: "unreadable", value: null }),
    [patchField]
  );

  /** Back to pending, restoring the OCR value (original is never lost). */
  const reset = useCallback(
    (imageId: string, lineNumber: number, key: ReviewFieldKey) => {
      const page = pagesRef.current.find((entry) => entry.imageId === imageId);
      const field = page?.entries.find((entry) => entry.lineNumber === lineNumber)?.fields[key];
      patchField(imageId, lineNumber, key, {
        status: "pending",
        value: field?.originalValue ?? null,
      });
    },
    [patchField]
  );

  const isPageResolved = useCallback((page: ReviewPage) => {
    return page.entries.every((entry) =>
      REVIEW_FIELD_KEYS.every((key) => entry.fields[key].status !== "pending")
    );
  }, []);

  /** Confirm gate: every field resolved. Returns whether it confirmed. */
  const confirmPage = useCallback(
    (imageId: string): boolean => {
      const page = pagesRef.current.find((entry) => entry.imageId === imageId);
      if (!page || page.confirmed || !isPageResolved(page)) return false;
      commit(
        pagesRef.current.map((entry) =>
          entry.imageId === imageId ? { ...entry, confirmed: true } : entry
        )
      );
      return true;
    },
    [commit, isPageResolved]
  );

  const progress: ReviewProgress = useMemo(() => {
    let fieldsTotal = 0;
    let autoAccepted = 0;
    let accepted = 0;
    let edited = 0;
    let unreadable = 0;
    let pending = 0;
    for (const page of pages) {
      for (const entry of page.entries) {
        for (const key of REVIEW_FIELD_KEYS) {
          const field = entry.fields[key];
          fieldsTotal++;
          if (field.status === "pending") pending++;
          else if (field.status === "edited") edited++;
          else if (field.status === "unreadable") unreadable++;
          else if (
            field.originalValue !== null &&
            field.confidence >= AUTO_ACCEPT_THRESHOLD &&
            field.value === field.originalValue
          )
            autoAccepted++;
          else accepted++;
        }
      }
    }
    return {
      pagesTotal: pages.length,
      pagesConfirmed: pages.filter((page) => page.confirmed).length,
      fieldsTotal,
      fieldsResolved: fieldsTotal - pending,
      autoAccepted,
      accepted,
      edited,
      unreadable,
      pending,
    };
  }, [pages]);

  return { pages, accept, edit, markUnreadable, reset, confirmPage, isPageResolved, progress };
}

export type UseOcrReviewReturn = ReturnType<typeof useOcrReview>;
