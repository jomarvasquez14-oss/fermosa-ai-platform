"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import {
  OCRImageViewer,
  OCRNavigation,
  OCRReviewPanel,
  OCRSummary,
  type ReviewPage,
} from "@/components/ocr-review";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useOcrReview } from "@/hooks/use-ocr-review";

/**
 * OCR review workflow (Sprint 3.3): original page beside extracted fields,
 * page-by-page, confirm when every field is resolved.
 *
 * Runs on MOCK extractions and keeps decisions client-side — persistence of
 * confirmed data ships with OCR integration. The banner says so (placeholder
 * honesty, PROJECT_RULES 28).
 */
export function OcrReviewScreen({
  submissionId,
  initialPages,
}: {
  submissionId: string;
  initialPages: ReviewPage[];
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { pages, accept, edit, markUnreadable, reset, confirmPage, isPageResolved, progress } =
    useOcrReview(initialPages);

  const current = pages[currentIndex];
  const allConfirmed = progress.pagesConfirmed === progress.pagesTotal && progress.pagesTotal > 0;

  function handleConfirm() {
    if (!current) return;
    if (confirmPage(current.imageId)) {
      const nextUnconfirmed = pages.findIndex(
        (page, index) => index !== currentIndex && !page.confirmed
      );
      if (nextUnconfirmed !== -1) setCurrentIndex(nextUnconfirmed);
      toast.success(`Page ${current.pageNumber} confirmed`, {
        description: "Review decisions are not persisted yet — that ships with OCR integration.",
      });
    }
  }

  if (!current) return null;

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <Alert>
        <AlertTitle>Preview with simulated OCR</AlertTitle>
        <AlertDescription>
          Extractions below are mock data (no AI was called) and confirmations are not saved. This
          interface goes live when the OCR pipeline is integrated.
        </AlertDescription>
      </Alert>

      <OCRSummary progress={progress} />

      {allConfirmed && (
        <Alert>
          <PartyPopper aria-hidden="true" />
          <AlertTitle>Review complete</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            All {progress.pagesTotal} pages confirmed ({progress.edited} corrections,{" "}
            {progress.unreadable} unreadable).
            <Button asChild variant="outline" size="sm">
              <Link href={`/audit/${submissionId}`}>
                <ArrowLeft aria-hidden="true" />
                Back to submission
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <OCRNavigation
        pages={pages}
        currentIndex={currentIndex}
        canConfirmCurrent={isPageResolved(current)}
        onNavigate={setCurrentIndex}
        onConfirmCurrent={handleConfirm}
      />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <OCRImageViewer
          src={`/api/images/${current.imageId}`}
          alt={`Logbook page ${current.pageNumber}: ${current.fileName}`}
          pageNumber={current.pageNumber}
          className="lg:sticky lg:top-4"
        />
        <OCRReviewPanel
          page={current}
          onAccept={(line, key) => accept(current.imageId, line, key)}
          onEdit={(line, key, value) => edit(current.imageId, line, key, value)}
          onMarkUnreadable={(line, key) => markUnreadable(current.imageId, line, key)}
          onReset={(line, key) => reset(current.imageId, line, key)}
        />
      </div>
    </div>
  );
}
