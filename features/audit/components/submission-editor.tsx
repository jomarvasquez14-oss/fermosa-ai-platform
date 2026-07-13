"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  ImagePreviewDialog,
  ImageSorter,
  UploadDropzone,
  UploadRejections,
  UploadToolbar,
  MAX_IMAGES,
  type UploadImageItem,
} from "@/components/upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createDraftAction,
  removeImageAction,
  retryImageUploadAction,
  saveDraftAction,
  submitSubmissionAction,
  uploadImageAction,
} from "@/features/audit/actions/submission-actions";
import { useImageUpload } from "@/hooks/use-image-upload";

/** Serializable shape the server page passes for an existing draft. */
export interface EditorSubmission {
  id: string;
  auditDate: string; // yyyy-mm-dd
  notes: string | null;
  images: Array<{
    id: string;
    fileName: string;
    sizeBytes: number;
    rotation: number;
    stored: boolean;
  }>;
}

interface SubmissionEditorProps {
  submission?: EditorSubmission;
}

function todayISODate(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function toItems(submission: EditorSubmission): UploadImageItem[] {
  return submission.images.map((image) => ({
    id: image.id,
    serverId: image.id,
    previewUrl: `/api/images/${image.id}`,
    fileName: image.fileName,
    sizeBytes: image.sizeBytes,
    rotation: (image.rotation as UploadImageItem["rotation"]) ?? 0,
    previewable: image.stored,
    uploadState: image.stored ? ("stored" as const) : ("failed" as const),
  }));
}

/**
 * Audit submission editor (Sprint 2A.2).
 *
 * New submissions stage images client-side and persist everything on
 * "Save draft" / "Submit". On an existing draft, adds/removes persist
 * immediately (audit-trail events), while order/rotation/date persist on
 * "Save draft" — reopening a draft restores everything losslessly.
 */
export function SubmissionEditor({ submission }: SubmissionEditorProps) {
  const router = useRouter();
  const [submissionId, setSubmissionId] = useState<string | null>(submission?.id ?? null);
  const [auditDate, setAuditDate] = useState<string>(submission?.auditDate ?? todayISODate());
  const [busy, setBusy] = useState<null | "draft" | "submit" | "upload">(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const {
    images,
    rejections,
    addFiles,
    removeImage,
    updateImage,
    rotateImage,
    moveImage,
    markUnpreviewable,
    dismissRejection,
    clearRejections,
  } = useImageUpload(submission ? toItems(submission) : []);

  const previewIndex = useMemo(
    () => images.findIndex((image) => image.id === previewId),
    [images, previewId]
  );
  const previewImage = previewIndex === -1 ? null : (images[previewIndex] ?? null);

  const batchFull = images.length >= MAX_IMAGES;
  const hasFailures = images.some((image) => image.uploadState === "failed");
  // Failed uploads whose File is gone (draft reopened later) cannot be
  // retried client-side — they must be removed before submitting.
  const hasUnrecoverableFailures = images.some(
    (image) => image.uploadState === "failed" && !image.file
  );
  const canSubmit = images.length > 0 && auditDate.length > 0 && !busy && !hasUnrecoverableFailures;

  /**
   * Upload one staged item against a known submission id. Records the new
   * server id in `serverIds` — React state updates are async, so the caller
   * must not rely on its (stale) `images` snapshot for ids minted here.
   */
  async function uploadOne(
    target: UploadImageItem,
    id: string,
    serverIds: Map<string, string>
  ): Promise<boolean> {
    if (!target.file) return target.uploadState === "stored";
    updateImage(target.id, { uploadState: "uploading" });
    const formData = new FormData();
    formData.set("submissionId", id);
    formData.set("rotation", String(target.rotation));
    formData.set("file", target.file);
    const result = await uploadImageAction(formData);
    if (!result.ok) {
      updateImage(target.id, { uploadState: "failed" });
      toast.error(result.error);
      return false;
    }
    serverIds.set(target.id, result.data.imageId);
    updateImage(target.id, {
      serverId: result.data.imageId,
      uploadState: result.data.status === "STORED" ? "stored" : "failed",
    });
    return result.data.status === "STORED";
  }

  /**
   * Ensure the draft exists and every image is persisted. Returns the
   * submission id plus the client-id → server-id map for images uploaded in
   * this pass, or null when even the draft could not be created.
   */
  async function persistAll(): Promise<{ id: string; serverIds: Map<string, string> } | null> {
    let id = submissionId;
    if (!id) {
      const created = await createDraftAction({ auditDate });
      if (!created.ok) {
        toast.error(created.error);
        return null;
      }
      id = created.data.submissionId;
      setSubmissionId(id);
    }

    // Sequential uploads: predictable order, per-image failure isolation.
    const serverIds = new Map<string, string>();
    for (const item of images) {
      if (item.uploadState === "staged" || (item.uploadState === "failed" && !item.serverId)) {
        await uploadOne(item, id, serverIds);
      } else if (item.uploadState === "failed" && item.serverId && item.file) {
        await retryOne(item);
      }
    }
    return { id, serverIds };
  }

  async function retryOne(target: UploadImageItem): Promise<boolean> {
    if (!target.serverId || !target.file) return false;
    updateImage(target.id, { uploadState: "uploading" });
    const formData = new FormData();
    formData.set("imageId", target.serverId);
    formData.set("file", target.file);
    const result = await retryImageUploadAction(formData);
    const stored = result.ok && result.data.status === "STORED";
    updateImage(target.id, { uploadState: stored ? "stored" : "failed" });
    if (!result.ok) toast.error(result.error);
    return stored;
  }

  /**
   * Current layout (order + rotation), resolving server ids minted during
   * this pass (the `images` snapshot may predate them).
   */
  function layoutFor(current: UploadImageItem[], serverIds: Map<string, string>) {
    return current
      .map((image) => ({ image, serverId: serverIds.get(image.id) ?? image.serverId }))
      .filter((entry) => entry.serverId)
      .map((entry, index) => ({
        imageId: entry.serverId as string,
        displayOrder: index + 1,
        rotation: entry.image.rotation,
      }));
  }

  async function handleSaveDraft() {
    setBusy("draft");
    try {
      const persisted = await persistAll();
      if (!persisted) return;
      const result = await saveDraftAction({
        submissionId: persisted.id,
        auditDate,
        images: layoutFor(images, persisted.serverIds),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Draft saved", {
        description: "You can continue editing this submission later from the Audit page.",
      });
      router.push(`/audit/${persisted.id}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit() {
    setBusy("submit");
    try {
      const persisted = await persistAll();
      if (!persisted) return;
      const saved = await saveDraftAction({
        submissionId: persisted.id,
        auditDate,
        images: layoutFor(images, persisted.serverIds),
      });
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }
      const result = await submitSubmissionAction(persisted.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Submission sent", {
        description: "The submission is now locked. Processing begins in a later sprint.",
      });
      router.push(`/audit/${persisted.id}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove(id: string) {
    const target = images.find((image) => image.id === id);
    if (target?.serverId) {
      const result = await removeImageAction(target.serverId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
    }
    removeImage(id);
  }

  /**
   * Selected files are staged locally and persisted by the next
   * "Save draft" / "Submit" (persistAll) — one consistent rule for new and
   * reopened drafts. Removals of already-persisted images apply immediately.
   */
  function handleFilesSelected(files: File[]) {
    addFiles(files);
  }

  return (
    <div className="flex flex-col gap-4 pb-24 sm:gap-6 lg:pb-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit date</CardTitle>
          <CardDescription>The date the logbook pages you are uploading cover.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-2">
            <Label htmlFor="audit-date">Date</Label>
            <Input
              id="audit-date"
              type="date"
              value={auditDate}
              max={todayISODate()}
              required
              disabled={busy !== null}
              onChange={(event) => setAuditDate(event.target.value)}
              className="h-11"
            />
          </div>
        </CardContent>
      </Card>

      <UploadRejections
        rejections={rejections}
        onDismiss={dismissRejection}
        onDismissAll={clearRejections}
      />

      {images.length === 0 ? (
        <UploadDropzone onFilesSelected={handleFilesSelected} disabled={busy !== null} />
      ) : (
        <section aria-label="Uploaded images" className="flex flex-col gap-4">
          <UploadToolbar
            images={images}
            onClearAll={() => {
              for (const image of [...images]) void handleRemove(image.id);
            }}
          />
          <ImageSorter
            images={images}
            onPreview={setPreviewId}
            onDelete={(id) => void handleRemove(id)}
            onRotate={rotateImage}
            onMove={moveImage}
            onPreviewError={markUnpreviewable}
            onRetry={(id) => {
              const target = images.find((image) => image.id === id);
              if (target) void retryOne(target);
            }}
          />
          <UploadDropzone
            onFilesSelected={handleFilesSelected}
            compact
            disabled={batchFull || busy !== null}
          />
          {batchFull && (
            <p role="status" className="text-sm text-muted-foreground">
              This batch is full ({MAX_IMAGES} images). Remove an image to add another.
            </p>
          )}
          {hasFailures && (
            <p role="alert" className="text-sm text-destructive">
              Some images failed to upload. Retry or remove them — submitting is blocked until every
              image is stored.
            </p>
          )}
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 flex-1 sm:flex-none lg:h-10"
            disabled={busy !== null}
            asChild
          >
            <Link href="/audit">Cancel</Link>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="h-12 flex-1 sm:flex-none lg:h-10"
            disabled={images.length === 0 || auditDate.length === 0 || busy !== null}
            onClick={() => void handleSaveDraft()}
          >
            {busy === "draft" ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Save aria-hidden="true" />
            )}
            Save draft
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-12 flex-1 sm:flex-none lg:h-10"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
            aria-describedby={canSubmit ? undefined : "continue-hint"}
          >
            {busy === "submit" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Submit
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
        {!canSubmit && (
          <p id="continue-hint" className="sr-only">
            Add at least one image to submit.
          </p>
        )}
      </div>

      <ImagePreviewDialog
        image={previewImage}
        pageNumber={previewIndex === -1 ? null : previewIndex + 1}
        onOpenChange={(open) => {
          if (!open) setPreviewId(null);
        }}
        onRotate={rotateImage}
      />
    </div>
  );
}
