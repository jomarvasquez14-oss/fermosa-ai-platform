-- CreateEnum
CREATE TYPE "AuditStage" AS ENUM ('OCR', 'HUMAN_REVIEW', 'CRM_RETRIEVAL', 'MATCHING', 'REPORT');

-- CreateEnum
CREATE TYPE "AuditRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "audit_jobs" (
    "id" TEXT NOT NULL,
    "status" "AuditRunStatus" NOT NULL DEFAULT 'QUEUED',
    "submission_id" TEXT NOT NULL,
    "started_by_id" TEXT NOT NULL,
    "current_stage" "AuditStage",
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_job_stages" (
    "id" TEXT NOT NULL,
    "stage" "AuditStage" NOT NULL,
    "status" "AuditRunStatus" NOT NULL DEFAULT 'QUEUED',
    "job_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "waiting_reason" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_job_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_jobs_submission_id_status_idx" ON "audit_jobs"("submission_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "audit_job_stages_job_id_stage_key" ON "audit_job_stages"("job_id", "stage");

-- AddForeignKey
ALTER TABLE "audit_jobs" ADD CONSTRAINT "audit_jobs_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "audit_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_jobs" ADD CONSTRAINT "audit_jobs_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_job_stages" ADD CONSTRAINT "audit_job_stages_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "audit_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
