"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReviewPage } from "./types";

interface OCRNavigationProps {
  pages: ReviewPage[];
  currentIndex: number;
  /** Whether the current page has every field resolved (confirm gate). */
  canConfirmCurrent: boolean;
  onNavigate: (index: number) => void;
  onConfirmCurrent: () => void;
}

/**
 * Page-by-page navigation with per-page confirmation state, and the Confirm
 * action for the current page. Confirm is gated on every field being
 * resolved — nothing is confirmed implicitly.
 */
export function OCRNavigation({
  pages,
  currentIndex,
  canConfirmCurrent,
  onNavigate,
  onConfirmCurrent,
}: OCRNavigationProps) {
  const current = pages[currentIndex];

  return (
    <nav
      aria-label="OCR review pages"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3"
    >
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous page"
          disabled={currentIndex === 0}
          onClick={() => onNavigate(currentIndex - 1)}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <ol className="m-0 flex list-none items-center gap-1.5 p-0">
          {pages.map((page, index) => (
            <li key={page.imageId}>
              <button
                type="button"
                aria-label={`Page ${page.pageNumber}${page.confirmed ? " (confirmed)" : ""}`}
                aria-current={index === currentIndex ? "page" : undefined}
                onClick={() => onNavigate(index)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border font-mono text-xs tabular-nums",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  index === currentIndex && "border-primary ring-1 ring-primary",
                  page.confirmed
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted/40"
                )}
              >
                {page.confirmed ? <Check className="size-4" aria-hidden="true" /> : page.pageNumber}
              </button>
            </li>
          ))}
        </ol>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next page"
          disabled={currentIndex >= pages.length - 1}
          onClick={() => onNavigate(currentIndex + 1)}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>

      {current && !current.confirmed ? (
        <Button
          type="button"
          disabled={!canConfirmCurrent}
          onClick={onConfirmCurrent}
          aria-describedby={canConfirmCurrent ? undefined : "confirm-hint"}
        >
          <Check aria-hidden="true" />
          Confirm page {current.pageNumber}
        </Button>
      ) : (
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Page confirmed</p>
      )}
      {current && !current.confirmed && !canConfirmCurrent && (
        <p id="confirm-hint" className="w-full text-xs text-muted-foreground">
          Resolve every field (accept, edit, or mark unreadable) to confirm this page.
        </p>
      )}
    </nav>
  );
}
