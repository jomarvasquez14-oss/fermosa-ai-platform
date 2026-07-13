import "server-only";
import {
  AuditSubmissionStatus,
  AuditTrailAction,
  LogbookImageStatus,
  Prisma,
} from "@prisma/client";
import { ROLES, type AppRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import { ForbiddenError, InvalidStateError, NotFoundError } from "@/lib/errors";
import { appEvents } from "@/lib/events";
import { logger } from "@/lib/logger";

/**
 * Audit submission data access (Sprint 2A.2).
 *
 * Enforces the aggregate invariants of docs/DOMAIN_MODEL.md at the data
 * layer, so every caller inherits them:
 *  - images exist only inside a submission and are mutated only through it;
 *  - branch scoping: Branch Managers touch only their own branch, Auditors
 *    are read-only, Super Admins have full access;
 *  - post-submit immutability: no image/date/order/rotation changes after
 *    SUBMITTED — future OCR/review data lives on separate entities;
 *  - every business action appends an immutable audit-trail entry.
 *
 * All methods take an explicit `actor` (id/role/branchId from the session)
 * rather than reading auth state, so authorization is unit-testable.
 */

export interface Actor {
  id: string;
  role: AppRole;
  branchId: string | null;
}

// Re-exported so non-service code can type against the enums without
// importing Prisma directly (PROJECT_RULES rule 7).
export type { AuditSubmissionStatus, LogbookImageStatus } from "@prisma/client";

export interface ImageOrderInput {
  imageId: string;
  displayOrder: number;
  rotation: number;
}

const MAX_IMAGES = 20;

const imageOrderBy = { displayOrder: "asc" } as const;

const submissionInclude = {
  images: { orderBy: imageOrderBy },
  branch: { select: { id: true, name: true, code: true } },
  submittedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.AuditSubmissionInclude;

export type SubmissionWithImages = Prisma.AuditSubmissionGetPayload<{
  include: typeof submissionInclude;
}>;

function canRead(actor: Actor, branchId: string): boolean {
  if (actor.role === ROLES.SUPER_ADMIN || actor.role === ROLES.AUDITOR) return true;
  return actor.role === ROLES.BRANCH_MANAGER && actor.branchId === branchId;
}

function canMutate(actor: Actor, branchId: string): boolean {
  if (actor.role === ROLES.SUPER_ADMIN) return true;
  // Auditors are read-only by design; Branch Managers only within their branch.
  return actor.role === ROLES.BRANCH_MANAGER && actor.branchId === branchId;
}

/** Load a submission the actor may read; 404 to hide existence otherwise. */
async function getReadable(actor: Actor, submissionId: string): Promise<SubmissionWithImages> {
  const submission = await prisma.auditSubmission.findUnique({
    where: { id: submissionId },
    include: submissionInclude,
  });
  if (!submission || !canRead(actor, submission.branchId)) {
    throw new NotFoundError("Submission");
  }
  return submission;
}

/** Load a submission the actor may mutate, and require DRAFT/UPLOADING state. */
async function getMutableDraft(actor: Actor, submissionId: string): Promise<SubmissionWithImages> {
  const submission = await getReadable(actor, submissionId);
  if (!canMutate(actor, submission.branchId)) {
    throw new ForbiddenError();
  }
  if (
    submission.status !== AuditSubmissionStatus.DRAFT &&
    submission.status !== AuditSubmissionStatus.UPLOADING
  ) {
    throw new InvalidStateError(
      "This submission has been submitted and is read-only. Submitted evidence is never modified."
    );
  }
  return submission;
}

export const auditSubmissionService = {
  /** Scoped listing: BM = own branch; Auditor/SA = all branches. */
  async list(actor: Actor): Promise<SubmissionWithImages[]> {
    const where: Prisma.AuditSubmissionWhereInput =
      actor.role === ROLES.BRANCH_MANAGER ? { branchId: actor.branchId ?? "__none__" } : {};
    return prisma.auditSubmission.findMany({
      where,
      include: submissionInclude,
      orderBy: { createdAt: "desc" },
    });
  },

  async get(actor: Actor, submissionId: string): Promise<SubmissionWithImages> {
    return getReadable(actor, submissionId);
  },

  /** Image lookup for the authenticated file-serving route — scoped like reads. */
  async getImage(actor: Actor, imageId: string) {
    const image = await prisma.logbookImage.findUnique({
      where: { id: imageId },
      include: { submission: { select: { branchId: true } } },
    });
    if (!image || !canRead(actor, image.submission.branchId)) {
      throw new NotFoundError("Image");
    }
    return image;
  },

  /** Create a DRAFT submission (DOMAIN_MODEL.md §5.1 entry point). */
  async createDraft(actor: Actor, input: { auditDate: Date; notes?: string }) {
    const branchId = actor.branchId;
    if (!branchId || !canMutate(actor, branchId)) {
      throw new ForbiddenError("Only branch staff with an assigned branch can create submissions.");
    }

    const submission = await prisma.auditSubmission.create({
      data: {
        auditDate: input.auditDate,
        notes: input.notes,
        branchId,
        submittedById: actor.id,
        status: AuditSubmissionStatus.DRAFT,
        trailEntries: {
          create: { action: AuditTrailAction.SUBMISSION_CREATED, actorId: actor.id },
        },
      },
      include: submissionInclude,
    });

    logger.info("Audit submission created", { submissionId: submission.id, actorId: actor.id });
    return submission;
  },

  /**
   * Register one image on a draft (metadata only — the caller stores the
   * binary and then reports success/failure). Stable image id is born here.
   */
  async addImage(
    actor: Actor,
    submissionId: string,
    input: {
      originalFileName: string;
      mimeType?: string;
      fileSizeBytes?: number;
      rotation?: number;
    }
  ) {
    const submission = await getMutableDraft(actor, submissionId);
    if (submission.images.length >= MAX_IMAGES) {
      throw new InvalidStateError(`A submission holds at most ${MAX_IMAGES} images.`);
    }

    const nextOrder = (submission.images.at(-1)?.displayOrder ?? 0) + 1;
    const [image] = await prisma.$transaction([
      prisma.logbookImage.create({
        data: {
          submissionId,
          displayOrder: nextOrder,
          rotation: input.rotation ?? 0,
          originalFileName: input.originalFileName,
          mimeType: input.mimeType,
          fileSizeBytes: input.fileSizeBytes,
          status: LogbookImageStatus.UPLOADING,
        },
      }),
      prisma.auditTrailEntry.create({
        data: {
          submissionId,
          actorId: actor.id,
          action: AuditTrailAction.IMAGE_ADDED,
          metadata: { fileName: input.originalFileName },
        },
      }),
    ]);
    return image;
  },

  /** Binary landed in storage: STORED + storageKey + uploadedAt (§5.2). */
  async markImageStored(actor: Actor, imageId: string, storageKey: string) {
    const image = await this.getImage(actor, imageId);
    if (!canMutate(actor, image.submission.branchId)) throw new ForbiddenError();
    const updated = await prisma.logbookImage.update({
      where: { id: imageId },
      data: { status: LogbookImageStatus.STORED, storageKey, uploadedAt: new Date() },
    });
    await appEvents.publish("logbook.image.stored", {
      imageId,
      submissionId: image.submissionId,
      branchId: image.submission.branchId,
    });
    return updated;
  },

  /** Transfer failed: metadata survives so the upload can be retried (§5.2). */
  async markImageFailed(actor: Actor, imageId: string) {
    const image = await this.getImage(actor, imageId);
    if (!canMutate(actor, image.submission.branchId)) throw new ForbiddenError();
    return prisma.logbookImage.update({
      where: { id: imageId },
      data: { status: LogbookImageStatus.UPLOAD_FAILED },
    });
  },

  /** Reset a failed image to UPLOADING for a retry attempt. */
  async markImageUploading(actor: Actor, imageId: string) {
    const image = await this.getImage(actor, imageId);
    if (!canMutate(actor, image.submission.branchId)) throw new ForbiddenError();
    await getMutableDraft(actor, image.submissionId);
    return prisma.logbookImage.update({
      where: { id: imageId },
      data: { status: LogbookImageStatus.UPLOADING },
    });
  },

  /**
   * Remove an image from a draft (hard delete is legal only here —
   * DOMAIN_MODEL.md §5.2). Returns the storage key so the caller can GC the blob.
   */
  async removeImage(actor: Actor, imageId: string): Promise<{ storageKey: string | null }> {
    const image = await this.getImage(actor, imageId);
    await getMutableDraft(actor, image.submissionId);

    await prisma.$transaction([
      prisma.logbookImage.delete({ where: { id: imageId } }),
      // Close the ordering gap so displayOrder stays contiguous (1..n).
      prisma.logbookImage.updateMany({
        where: { submissionId: image.submissionId, displayOrder: { gt: image.displayOrder } },
        data: { displayOrder: { decrement: 1 } },
      }),
      prisma.auditTrailEntry.create({
        data: {
          submissionId: image.submissionId,
          actorId: actor.id,
          action: AuditTrailAction.IMAGE_REMOVED,
          metadata: { imageId, fileName: image.originalFileName },
        },
      }),
    ]);

    return { storageKey: image.storageKey };
  },

  /**
   * Save a draft: audit date, notes, and the full order/rotation layout in
   * one transaction. Recovers losslessly on reopen (sprint rule: no data loss).
   */
  async saveDraft(
    actor: Actor,
    submissionId: string,
    input: { auditDate: Date; notes?: string; images: ImageOrderInput[] }
  ) {
    const submission = await getMutableDraft(actor, submissionId);

    const knownIds = new Set(submission.images.map((image) => image.id));
    const inputIds = input.images.map((image) => image.imageId);
    if (inputIds.length !== knownIds.size || !inputIds.every((id) => knownIds.has(id))) {
      throw new InvalidStateError(
        "Draft layout does not match the submission's images. Reload and try again."
      );
    }
    const orders = [...input.images].map((i) => i.displayOrder).sort((a, b) => a - b);
    if (!orders.every((order, index) => order === index + 1)) {
      throw new InvalidStateError("Image order must be contiguous, starting at 1.");
    }

    const previousOrder = submission.images.map((image) => image.id);
    const nextOrder = [...input.images]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((image) => image.imageId);
    const reordered = previousOrder.join(",") !== nextOrder.join(",");

    await prisma.$transaction([
      prisma.auditSubmission.update({
        where: { id: submissionId },
        data: { auditDate: input.auditDate, notes: input.notes ?? null },
      }),
      ...input.images.map((image) =>
        prisma.logbookImage.update({
          where: { id: image.imageId },
          data: { displayOrder: image.displayOrder, rotation: image.rotation },
        })
      ),
      prisma.auditTrailEntry.create({
        data: { submissionId, actorId: actor.id, action: AuditTrailAction.DRAFT_SAVED },
      }),
      ...(reordered
        ? [
            prisma.auditTrailEntry.create({
              data: {
                submissionId,
                actorId: actor.id,
                action: AuditTrailAction.IMAGE_REORDERED,
                metadata: { from: previousOrder, to: nextOrder },
              },
            }),
          ]
        : []),
    ]);

    return this.get(actor, submissionId);
  },

  /**
   * Submit: validate, then freeze (DRAFT/UPLOADING → SUBMITTED, §5.1).
   * From here the submission is immutable evidence.
   */
  async submit(actor: Actor, submissionId: string) {
    const submission = await getMutableDraft(actor, submissionId);

    if (submission.images.length === 0) {
      throw new InvalidStateError("Add at least one logbook image before submitting.");
    }
    const notStored = submission.images.filter((i) => i.status !== LogbookImageStatus.STORED);
    if (notStored.length > 0) {
      throw new InvalidStateError(
        `${notStored.length} image(s) have not finished uploading. Retry or remove them first.`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Guard against a concurrent submit: the status check is re-applied
      // inside the transaction via updateMany's where clause.
      const result = await tx.auditSubmission.updateMany({
        where: {
          id: submissionId,
          status: { in: [AuditSubmissionStatus.DRAFT, AuditSubmissionStatus.UPLOADING] },
        },
        data: { status: AuditSubmissionStatus.SUBMITTED, submittedAt: new Date() },
      });
      if (result.count === 0) {
        throw new InvalidStateError("This submission was already submitted.");
      }
      await tx.auditTrailEntry.create({
        data: { submissionId, actorId: actor.id, action: AuditTrailAction.SUBMISSION_SUBMITTED },
      });
      return tx.auditSubmission.findUniqueOrThrow({
        where: { id: submissionId },
        include: submissionInclude,
      });
    });

    await appEvents.publish("submission.submitted", {
      submissionId,
      branchId: updated.branchId,
      submittedById: actor.id,
    });
    logger.info("Audit submission submitted", { submissionId, actorId: actor.id });
    return updated;
  },

  /** Trail entries for a submission (read-scoped like the submission). */
  async getTrail(actor: Actor, submissionId: string) {
    await getReadable(actor, submissionId);
    return prisma.auditTrailEntry.findMany({
      where: { submissionId },
      orderBy: { createdAt: "asc" },
      include: { actor: { select: { fullName: true } } },
    });
  },
};
