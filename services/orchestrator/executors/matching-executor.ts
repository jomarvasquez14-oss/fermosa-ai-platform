import { prisma } from "@/lib/db/prisma";
import { appEvents } from "@/lib/events";
import { logger } from "@/lib/logger";
import { getAIProvider } from "@/services/ai";
import { getCRMConnector } from "@/services/crm";
import { findingService } from "@/services/finding-service";
import { createRuleEngine, entryKey } from "@/services/rules";
import type { ConfirmedEntry, PatientResolution } from "@/services/rules";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";
import type { StageContext, StageExecutor, StageOutcome } from "../types";

/**
 * MATCHING stage executor (Sprint 3.7) — the first REAL executor: runs the
 * deterministic rule engine and persists its findings.
 *
 * Inputs are still simulated where integrations are pending:
 *  - "confirmed OCR" comes from the deterministic mock AI provider (real
 *    OcrResults replace this in the OCR integration sprint),
 *  - CRM records come from whichever connector is configured (mock today).
 * The rule engine and finding persistence are fully real.
 */
export const matchingExecutor: StageExecutor = {
  stage: "MATCHING",

  async execute(context: StageContext): Promise<StageOutcome> {
    const submission = await prisma.auditSubmission.findUniqueOrThrow({
      where: { id: context.submissionId },
      include: {
        branch: { select: { name: true } },
        images: { orderBy: { displayOrder: "asc" } },
      },
    });
    const auditDate = submission.auditDate.toISOString().slice(0, 10);

    // --- Simulated confirmed OCR (deterministic per image) ---
    const provider = getAIProvider("mock");
    const entries: ConfirmedEntry[] = [];
    for (const [index, image] of submission.images.entries()) {
      if (image.status !== "STORED") continue;
      const result = await provider.extractLogbook({
        image: { data: new Uint8Array(image.fileSizeBytes ?? 1024), mimeType: "image/png" },
        promptVersion: "logbook-extraction/v001",
        model: "mock-messy",
      });
      for (const entry of result.extraction?.entries ?? []) {
        entries.push({
          imageId: image.id,
          pageNumber: index + 1,
          lineNumber: entry.lineNumber,
          patientName: entry.patientName.value,
          treatment: entry.treatment.value,
          therapist: entry.therapist.value,
          time: entry.time.value,
        });
      }
    }

    // --- CRM discovery through the connector seam ---
    const connector = getCRMConnector();
    const resolutions: PatientResolution[] = [];
    const recordsById = new Map<string, NormalizedCrmPatientRecord>();
    const window = { from: shiftDays(auditDate, -7), to: shiftDays(auditDate, 1) };

    await appEvents.publish("crm.read.started", { submissionId: submission.id, query: {} });
    for (const entry of entries) {
      if (!entry.patientName) continue;
      const lookup = await connector.findPatients({ name: entry.patientName });
      const resolution: PatientResolution = {
        entryKey: entryKey(entry),
        outcome: lookup.outcome,
        crmPatientId: lookup.outcome === "found" ? lookup.candidates[0]!.crmId : null,
        candidateIds:
          lookup.outcome === "ambiguous"
            ? lookup.candidates.map((candidate) => candidate.crmId)
            : undefined,
      };
      resolutions.push(resolution);
      if (resolution.crmPatientId && !recordsById.has(resolution.crmPatientId)) {
        recordsById.set(
          resolution.crmPatientId,
          await connector.fetchPatientRecord(resolution.crmPatientId, window)
        );
      }
    }
    await appEvents.publish("crm.read.completed", {
      submissionId: submission.id,
      recordCount: recordsById.size,
      success: true,
    });

    // --- The real thing: deterministic rules → canonical findings ---
    await appEvents.publish("matching.started", { submissionId: submission.id });
    const report = createRuleEngine().evaluate({
      submission: { id: submission.id, branchName: submission.branch.name, auditDate },
      entries,
      resolutions,
      crmRecords: [...recordsById.values()],
    });

    const persisted = await findingService.createForSubmission(
      submission.id,
      "RULE_ENGINE",
      report.findings
    );
    await appEvents.publish("matching.completed", {
      submissionId: submission.id,
      matched: report.results.filter((result) => result.outcome === "pass").length,
      unmatched: report.findings.length,
    });
    logger.info("Matching stage evaluated", {
      submissionId: submission.id,
      entries: entries.length,
      findings: report.findings.length,
      created: persisted.created,
      riskScore: report.scores.riskScore,
      durationMs: Math.round(report.durationMs),
    });

    return { kind: "completed" };
  },
};

function shiftDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
