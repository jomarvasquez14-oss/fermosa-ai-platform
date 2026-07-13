/*
  Warnings:

  - You are about to drop the `audit_sessions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `logbook_uploads` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "AuditSubmissionStatus" AS ENUM ('DRAFT', 'UPLOADING', 'SUBMITTED', 'OCR_PROCESSING', 'OCR_REVIEW', 'CRM_COMPARISON', 'REPORT_GENERATION', 'COMPLETED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LogbookImageStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADING', 'STORED', 'UPLOAD_FAILED');

-- DropForeignKey
ALTER TABLE "audit_sessions" DROP CONSTRAINT "audit_sessions_auditor_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_sessions" DROP CONSTRAINT "audit_sessions_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "logbook_uploads" DROP CONSTRAINT "logbook_uploads_audit_session_id_fkey";

-- DropForeignKey
ALTER TABLE "logbook_uploads" DROP CONSTRAINT "logbook_uploads_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "logbook_uploads" DROP CONSTRAINT "logbook_uploads_uploaded_by_id_fkey";

-- DropTable
DROP TABLE "audit_sessions";

-- DropTable
DROP TABLE "logbook_uploads";

-- DropEnum
DROP TYPE "AuditSessionStatus";

-- DropEnum
DROP TYPE "UploadStatus";

-- CreateTable
CREATE TABLE "audit_submissions" (
    "id" TEXT NOT NULL,
    "status" "AuditSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "audit_date" DATE NOT NULL,
    "branch_id" TEXT NOT NULL,
    "submitted_by_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logbook_images" (
    "id" TEXT NOT NULL,
    "status" "LogbookImageStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "submission_id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "original_file_name" TEXT NOT NULL,
    "mime_type" TEXT,
    "file_size_bytes" INTEGER,
    "storage_key" TEXT,
    "uploaded_at" TIMESTAMP(3),
    "ocr_confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logbook_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_submissions_branch_id_audit_date_idx" ON "audit_submissions"("branch_id", "audit_date");

-- CreateIndex
CREATE INDEX "audit_submissions_submitted_by_id_idx" ON "audit_submissions"("submitted_by_id");

-- CreateIndex
CREATE INDEX "audit_submissions_status_idx" ON "audit_submissions"("status");

-- CreateIndex
CREATE INDEX "logbook_images_submission_id_display_order_idx" ON "logbook_images"("submission_id", "display_order");

-- CreateIndex
CREATE INDEX "logbook_images_status_idx" ON "logbook_images"("status");

-- AddForeignKey
ALTER TABLE "audit_submissions" ADD CONSTRAINT "audit_submissions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_submissions" ADD CONSTRAINT "audit_submissions_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logbook_images" ADD CONSTRAINT "logbook_images_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "audit_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
