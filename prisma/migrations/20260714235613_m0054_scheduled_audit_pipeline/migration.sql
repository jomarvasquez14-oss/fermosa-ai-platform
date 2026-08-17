-- CreateEnum
CREATE TYPE "ScheduleCadence" AS ENUM ('MANUAL', 'NIGHTLY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PipelineRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "audit_schedules" (
    "id" TEXT NOT NULL,
    "cadence" "ScheduleCadence" NOT NULL DEFAULT 'MANUAL',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "branch_id" TEXT,
    "last_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_runs" (
    "id" TEXT NOT NULL,
    "status" "PipelineRunStatus" NOT NULL DEFAULT 'RUNNING',
    "trigger" TEXT NOT NULL,
    "schedule_id" TEXT,
    "submission_id" TEXT,
    "stages" JSONB NOT NULL,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_schedules_enabled_next_run_at_idx" ON "audit_schedules"("enabled", "next_run_at");

-- CreateIndex
CREATE INDEX "pipeline_runs_status_started_at_idx" ON "pipeline_runs"("status", "started_at");

-- AddForeignKey
ALTER TABLE "audit_schedules" ADD CONSTRAINT "audit_schedules_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "audit_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "audit_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
