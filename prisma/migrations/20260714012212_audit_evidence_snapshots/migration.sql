-- CreateTable
CREATE TABLE "audit_evidence_snapshots" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "crm_patient_id" TEXT NOT NULL,
    "record" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "connector_kind" TEXT NOT NULL,
    "selector_version" TEXT NOT NULL,
    "retrieved_at" TIMESTAMP(3) NOT NULL,
    "window_from" TEXT,
    "window_to" TEXT,
    "snapshot_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_evidence_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_evidence_snapshots_submission_id_created_at_idx" ON "audit_evidence_snapshots"("submission_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_evidence_snapshots_crm_patient_id_idx" ON "audit_evidence_snapshots"("crm_patient_id");

-- AddForeignKey
ALTER TABLE "audit_evidence_snapshots" ADD CONSTRAINT "audit_evidence_snapshots_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "audit_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
