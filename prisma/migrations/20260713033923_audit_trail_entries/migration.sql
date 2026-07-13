-- CreateEnum
CREATE TYPE "AuditTrailAction" AS ENUM ('SUBMISSION_CREATED', 'DRAFT_SAVED', 'SUBMISSION_SUBMITTED', 'IMAGE_ADDED', 'IMAGE_REMOVED', 'IMAGE_REORDERED');

-- CreateTable
CREATE TABLE "audit_trail_entries" (
    "id" TEXT NOT NULL,
    "action" "AuditTrailAction" NOT NULL,
    "submission_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_trail_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_trail_entries_submission_id_created_at_idx" ON "audit_trail_entries"("submission_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_trail_entries_actor_id_idx" ON "audit_trail_entries"("actor_id");

-- AddForeignKey
ALTER TABLE "audit_trail_entries" ADD CONSTRAINT "audit_trail_entries_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "audit_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_trail_entries" ADD CONSTRAINT "audit_trail_entries_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
