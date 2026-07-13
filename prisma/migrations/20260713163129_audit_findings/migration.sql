-- CreateEnum
CREATE TYPE "FindingCategory" AS ENUM ('MISSING_IN_CRM', 'MISSING_IN_LOGBOOK', 'MISMATCHED_FIELD', 'UNMATCHED_PATIENT', 'AMBIGUOUS_PATIENT', 'MISSING_INVOICE', 'RECORD_EDITED', 'RECORD_DELETED', 'UNREADABLE_ENTRY', 'DUPLICATE_ENTRY', 'OTHER');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'REVIEWED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "FindingSource" AS ENUM ('RULE_ENGINE', 'CRM_DISCOVERY', 'OCR', 'AI_ANALYSIS', 'MANUAL_REVIEW');

-- CreateTable
CREATE TABLE "audit_findings" (
    "id" TEXT NOT NULL,
    "category" "FindingCategory" NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "source" "FindingSource" NOT NULL,
    "submission_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "recommendation" TEXT,
    "expected_value" TEXT,
    "actual_value" TEXT,
    "evidence" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "reviewed_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "resolution" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_findings_submission_id_status_idx" ON "audit_findings"("submission_id", "status");

-- CreateIndex
CREATE INDEX "audit_findings_category_idx" ON "audit_findings"("category");

-- CreateIndex
CREATE INDEX "audit_findings_severity_idx" ON "audit_findings"("severity");

-- AddForeignKey
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "audit_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
