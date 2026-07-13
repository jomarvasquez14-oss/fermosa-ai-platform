import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import type { ReviewPage } from "@/components/ocr-review";
import { buildReviewPages } from "@/components/ocr-review/build-review-pages";
import { OcrReviewScreen } from "@/features/audit/components/ocr-review-screen";
import { requirePermission } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { getAIProvider } from "@/services/ai";
import { auditSubmissionService, type Actor } from "@/services/audit-submission-service";
import { formatDateOnly } from "@/utils/format";

export const metadata: Metadata = {
  title: "OCR Review",
};

/**
 * OCR review for a submitted submission (Auditors + Super Admins).
 *
 * Sprint 3.3: extractions are generated with the MOCK provider (deterministic,
 * no AI calls, "messy" model so confidence bands are exercised) — real
 * OcrResults replace this feed when the OCR pipeline is integrated.
 */
export default async function OcrReviewPage(props: { params: Promise<{ submissionId: string }> }) {
  const user = await requirePermission("audit:manage");
  const { submissionId } = await props.params;
  const actor: Actor = { id: user.id, role: user.role, branchId: user.branchId ?? null };

  let submission;
  try {
    submission = await auditSubmissionService.get(actor, submissionId);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  // Review only exists for frozen evidence (DOMAIN_MODEL §5.1).
  if (submission.status === "DRAFT" || submission.status === "UPLOADING") {
    redirect(`/audit/${submissionId}`);
  }

  const storedImages = submission.images.filter((image) => image.status === "STORED");
  const mock = getAIProvider("mock");
  const extractions = await Promise.all(
    storedImages.map(async (image) => ({
      imageId: image.id,
      fileName: image.originalFileName,
      result: await mock.extractLogbook({
        // Deterministic per image: size-seeded bytes stand in for pixels.
        image: { data: new Uint8Array(image.fileSizeBytes ?? 1024), mimeType: "image/png" },
        promptVersion: "logbook-extraction/v001",
        model: "mock-messy",
      }),
    }))
  );

  const initialPages: ReviewPage[] = buildReviewPages(
    extractions
      .filter((entry) => entry.result.extraction !== null)
      .map((entry) => ({
        imageId: entry.imageId,
        fileName: entry.fileName,
        extraction: entry.result.extraction!,
      }))
  );

  return (
    <>
      <PageHeader
        title={`OCR Review — ${formatDateOnly(submission.auditDate)}`}
        description={`${submission.branch.name} · ${initialPages.length} page${initialPages.length === 1 ? "" : "s"} to review, one page at a time.`}
      />
      <OcrReviewScreen submissionId={submissionId} initialPages={initialPages} />
    </>
  );
}
