import type { FindingDraft, FindingEvidence } from "@/lib/findings";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";
import { normalize, similarity } from "./similarity";
import type { Rule, RuleResult } from "./types";

/**
 * Ten additional deterministic rules (M0047) — invoice/treatment cross-checks
 * and CRM activity-integrity signals not covered by the built-in thirteen
 * (`rules.ts`, unchanged by this milestone). Same shape, same style: pure,
 * synchronous, one FindingDraft per non-pass result. Registered alongside
 * BUILT_IN_RULES in `createRuleEngine` (`rule-engine.ts`).
 *
 * Five candidate rules were deliberately skipped as duplicates of existing
 * rules, or as unimplementable against the current record schema — see
 * docs/MILESTONES/M0047.md for the mapping.
 */

type Treatment = NormalizedCrmPatientRecord["treatments"][number];
type Invoice = NormalizedCrmPatientRecord["invoices"][number];

// ---------- local helpers ----------
// (rules.ts declares draft/fail/warn/pass/crmEvidence but does not export
// them; mirrored here rather than modifying rules.ts.)

const crmEvidence = (crmPatientId: string, description: string): FindingEvidence => ({
  type: "crm-record",
  crmPatientId,
  refNo: null,
  description,
});

function fail(ruleId: string, finding: FindingDraft): RuleResult {
  return { ruleId, outcome: "fail", finding };
}
function warn(ruleId: string, finding: FindingDraft): RuleResult {
  return { ruleId, outcome: "warning", finding };
}
const pass = (ruleId: string): RuleResult => ({ ruleId, outcome: "pass" });

const draft = (
  partial: Omit<FindingDraft, "source" | "recommendation" | "confidence"> & Partial<FindingDraft>
): FindingDraft => ({
  source: "RULE_ENGINE",
  recommendation: null,
  confidence: null,
  ...partial,
});

/** Treatments grouped by packageName (package-less treatments have nothing to compare). */
function groupByPackage(record: NormalizedCrmPatientRecord): Map<string, Treatment[]> {
  const groups = new Map<string, Treatment[]>();
  for (const treatment of record.treatments) {
    if (!treatment.packageName) continue;
    const list = groups.get(treatment.packageName);
    if (list) list.push(treatment);
    else groups.set(treatment.packageName, [treatment]);
  }
  return groups;
}

/** Best treatment an invoice bills, by service-name similarity (>= 0.6), or undefined. */
function billedTreatment(
  record: NormalizedCrmPatientRecord,
  invoice: Invoice
): Treatment | undefined {
  let best: { treatment: Treatment; score: number } | undefined;
  for (const treatment of record.treatments) {
    const score = similarity(invoice.serviceName, treatment.packageName ?? treatment.procedure);
    if (score >= 0.6 && (!best || score > best.score)) best = { treatment, score };
  }
  return best?.treatment;
}

// ---------- rules ----------

/** 1. Invoice dated before the treatment it bills — invoices follow treatment encoding. */
export const invoiceAfterTreatmentRule: Rule = {
  id: "invoice-after-treatment",
  description: "Invoices are dated on or after the treatment they bill",
  defaultWeight: 1,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      for (const invoice of record.invoices) {
        const treatment = billedTreatment(record, invoice);
        if (!treatment) continue; // no match at all — invoice-without-treatment owns this case
        if (invoice.dateUpdated < treatment.performedAt) {
          results.push(
            warn(
              this.id,
              draft({
                category: "MISMATCHED_FIELD",
                severity: "MEDIUM",
                title: `Invoice ${invoice.refNo} predates the treatment it bills`,
                detail: `Invoice ${invoice.refNo} (${invoice.serviceName}) is dated ${invoice.dateUpdated}, before the ${treatment.procedure} treatment it appears to bill on ${treatment.performedAt}.`,
                expectedValue: `Invoice dated on/after ${treatment.performedAt}`,
                actualValue: invoice.dateUpdated,
                evidence: [
                  crmEvidence(
                    record.patient.crmId,
                    `Invoice ${invoice.refNo} dated ${invoice.dateUpdated} vs treatment ${treatment.performedAt}`
                  ),
                ],
              })
            )
          );
        } else {
          results.push(pass(this.id));
        }
      }
    }
    return results;
  },
};

/** 2. Invoice with no corresponding treatment at all — mirror of missing-invoice's opposite direction. */
export const invoiceWithoutTreatmentRule: Rule = {
  id: "invoice-without-treatment",
  description: "Every invoice bills a recognizable CRM treatment",
  defaultWeight: 1,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      for (const invoice of record.invoices) {
        const treatment = billedTreatment(record, invoice);
        if (treatment) {
          results.push(pass(this.id));
        } else {
          results.push(
            fail(
              this.id,
              draft({
                category: "MISSING_IN_LOGBOOK",
                severity: "MEDIUM",
                title: `Invoice ${invoice.refNo} has no matching treatment record`,
                detail: `Invoice ${invoice.refNo} bills “${invoice.serviceName}” for ${record.patient.fullName}, but no CRM treatment matches it. Possible invoice for a service never encoded.`,
                expectedValue: `A treatment matching “${invoice.serviceName}”`,
                actualValue: "No matching treatment",
                evidence: [
                  crmEvidence(
                    record.patient.crmId,
                    `Invoice ${invoice.refNo} (${invoice.serviceName}), no treatment match`
                  ),
                ],
              })
            )
          );
        }
      }
    }
    return results;
  },
};

/** 3. Duplicate invoice: same reference number, or the same service/amount/date triple. */
export const duplicateInvoiceRule: Rule = {
  id: "duplicate-invoice",
  description: "Invoices are not duplicated by reference number or by service/amount/date",
  defaultWeight: 1,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      const seenByRef = new Map<string, Invoice>();
      const seenByTriple = new Map<string, Invoice>();
      for (const invoice of record.invoices) {
        const tripleKey = `${normalize(invoice.serviceName)}|${invoice.amount}|${invoice.dateUpdated}`;
        const duplicate = seenByRef.get(invoice.refNo) ?? seenByTriple.get(tripleKey);
        if (duplicate) {
          results.push(
            warn(
              this.id,
              draft({
                category: "DUPLICATE_ENTRY",
                severity: "MEDIUM",
                title: `Duplicate invoice for ${record.patient.fullName} (${invoice.refNo})`,
                detail: `Invoice ${invoice.refNo} (${invoice.serviceName}, ${invoice.amount}) duplicates invoice ${duplicate.refNo} dated ${invoice.dateUpdated}.`,
                expectedValue: "One invoice per billed service",
                actualValue: `${duplicate.refNo} and ${invoice.refNo}`,
                evidence: [
                  crmEvidence(
                    record.patient.crmId,
                    `Duplicate invoices ${duplicate.refNo} / ${invoice.refNo}`
                  ),
                ],
              })
            )
          );
        } else {
          results.push(pass(this.id));
        }
        if (!seenByRef.has(invoice.refNo)) seenByRef.set(invoice.refNo, invoice);
        if (!seenByTriple.has(tripleKey)) seenByTriple.set(tripleKey, invoice);
      }
    }
    return results;
  },
};

/** 4. Duplicate treatment: same procedure/date/branch recorded more than once. */
export const duplicateTreatmentRule: Rule = {
  id: "duplicate-treatment",
  description: "Treatments are not duplicated by procedure/date/branch",
  defaultWeight: 0.5,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      const seen = new Map<string, Treatment>();
      for (const treatment of record.treatments) {
        const key = `${normalize(treatment.procedure)}|${treatment.performedAt}|${treatment.branch.crmBranchId}`;
        const duplicate = seen.get(key);
        if (duplicate) {
          results.push(
            warn(
              this.id,
              draft({
                category: "DUPLICATE_ENTRY",
                severity: "LOW",
                title: `Duplicate treatment for ${record.patient.fullName} (${treatment.procedure})`,
                detail: `${treatment.procedure} on ${treatment.performedAt} at ${treatment.branch.name} is recorded more than once for this patient.`,
                expectedValue: "One treatment record per session",
                actualValue: `Duplicate of an earlier ${treatment.procedure} record`,
                evidence: [
                  crmEvidence(
                    record.patient.crmId,
                    `Duplicate ${treatment.procedure} on ${treatment.performedAt}`
                  ),
                ],
              })
            )
          );
        } else {
          results.push(pass(this.id));
        }
        if (!seen.has(key)) seen.set(key, treatment);
      }
    }
    return results;
  },
};

/** 5. Impossible session sequence: session numbers must increase in date order within a package. */
export const impossibleSessionSequenceRule: Rule = {
  id: "impossible-session-sequence",
  description: "Session numbers increase in date order within a package",
  defaultWeight: 1,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      for (const [packageName, treatments] of groupByPackage(record)) {
        const ordered = [...treatments].sort((a, b) =>
          a.performedAt < b.performedAt ? -1 : a.performedAt > b.performedAt ? 1 : 0
        );
        let previous: { performedAt: string; sessionNumber: number } | null = null;
        let violation: { performedAt: string; sessionNumber: number } | null = null;
        for (const treatment of ordered) {
          if (treatment.sessionNumber == null) continue;
          if (previous && treatment.sessionNumber <= previous.sessionNumber) {
            violation = { performedAt: treatment.performedAt, sessionNumber: treatment.sessionNumber };
            break;
          }
          previous = { performedAt: treatment.performedAt, sessionNumber: treatment.sessionNumber };
        }
        if (violation && previous) {
          results.push(
            warn(
              this.id,
              draft({
                category: "MISMATCHED_FIELD",
                severity: "MEDIUM",
                title: `Session sequence out of order for "${packageName}" (${record.patient.fullName})`,
                detail: `Session ${violation.sessionNumber} on ${violation.performedAt} is not later than session ${previous.sessionNumber} on ${previous.performedAt} for the same package.`,
                expectedValue: `Session number greater than ${previous.sessionNumber} after ${previous.performedAt}`,
                actualValue: `Session ${violation.sessionNumber} on ${violation.performedAt}`,
                evidence: [
                  crmEvidence(record.patient.crmId, `Package "${packageName}" session sequence`),
                ],
              })
            )
          );
        } else {
          results.push(pass(this.id));
        }
      }
    }
    return results;
  },
};

/** 6. Impossible package progression: a package's total session count must not change. */
export const impossiblePackageProgressionRule: Rule = {
  id: "impossible-package-progression",
  description: "A package's total session count is consistent across its treatments",
  defaultWeight: 1,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      for (const [packageName, treatments] of groupByPackage(record)) {
        const totals = new Set(
          treatments.map((t) => t.sessionsTotal).filter((value): value is number => value != null)
        );
        if (totals.size > 1) {
          const values = [...totals].join(", ");
          results.push(
            warn(
              this.id,
              draft({
                category: "RECORD_EDITED",
                severity: "MEDIUM",
                title: `Package total changed for "${packageName}" (${record.patient.fullName})`,
                detail: `Treatments under "${packageName}" show different session totals: ${values}. The package's total sessions should not change mid-course.`,
                expectedValue: "One consistent sessionsTotal per package",
                actualValue: values,
                evidence: [
                  crmEvidence(
                    record.patient.crmId,
                    `Package "${packageName}" sessionsTotal values: ${values}`
                  ),
                ],
              })
            )
          );
        } else {
          results.push(pass(this.id));
        }
      }
    }
    return results;
  },
};

/** 7. Repeated edits: frequent "updated" activity on one patient's records. */
export const repeatedEditsRule: Rule = {
  id: "repeated-edits",
  description: "Frequent 'updated' activity on one patient's records is flagged",
  defaultWeight: 2,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      const count = record.activity.filter(
        (event) => normalize(event.logName) === "updated"
      ).length;
      if (count >= context.config.repeatedEditsThreshold) {
        results.push(
          fail(
            this.id,
            draft({
              category: "RECORD_EDITED",
              severity: "HIGH",
              title: `Frequent record edits for ${record.patient.fullName}`,
              detail: `${count} "updated" activity events were logged for this patient — at or above the threshold of ${context.config.repeatedEditsThreshold}. Repeated edits to one patient's records are a tampering indicator.`,
              recommendation: "Review each edit's justification and compare against physical records.",
              expectedValue: `Fewer than ${context.config.repeatedEditsThreshold} edits`,
              actualValue: `${count} edits`,
              evidence: [crmEvidence(record.patient.crmId, `${count} "updated" activity events`)],
            })
          )
        );
      } else {
        results.push(pass(this.id));
      }
    }
    return results;
  },
};

/** 8. Suspicious activity frequency: unusually high activity volume for one patient. */
export const suspiciousActivityFrequencyRule: Rule = {
  id: "suspicious-activity-frequency",
  description: "Unusually high activity volume for one patient in the window is flagged",
  defaultWeight: 1,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      if (record.activity.length > context.config.activityFrequencyThreshold) {
        results.push(
          warn(
            this.id,
            draft({
              category: "OTHER",
              severity: "MEDIUM",
              title: `Unusually high CRM activity volume for ${record.patient.fullName}`,
              detail: `${record.activity.length} activity events were logged for this patient, above the configured threshold of ${context.config.activityFrequencyThreshold}.`,
              expectedValue: `Up to ${context.config.activityFrequencyThreshold} activity events`,
              actualValue: `${record.activity.length} activity events`,
              evidence: [
                crmEvidence(
                  record.patient.crmId,
                  `${record.activity.length} activity events in the window`
                ),
              ],
            })
          )
        );
      } else {
        results.push(pass(this.id));
      }
    }
    return results;
  },
};

/** 9. Staff mismatch: one package's sessions attributed to more than one staff member. */
export const staffMismatchRule: Rule = {
  id: "staff-mismatch",
  description: "One package's sessions are attributed to a single staff member",
  defaultWeight: 0.5,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      for (const [packageName, treatments] of groupByPackage(record)) {
        const names = new Set(
          treatments.map((t) => t.performedBy.name.trim()).filter((name) => name.length > 0)
        );
        if (names.size > 1) {
          const values = [...names].join(", ");
          results.push(
            warn(
              this.id,
              draft({
                category: "MISMATCHED_FIELD",
                severity: "LOW",
                title: `Package sessions attributed to different staff ("${packageName}", ${record.patient.fullName})`,
                detail: `Sessions under "${packageName}" are attributed to ${values}. Commission integrity depends on consistent attribution — verify.`,
                expectedValue: "One staff member per package",
                actualValue: values,
                evidence: [
                  crmEvidence(record.patient.crmId, `Package "${packageName}" staff: ${values}`),
                ],
              })
            )
          );
        } else {
          results.push(pass(this.id));
        }
      }
    }
    return results;
  },
};

/** 10. Package over-completion: a session number beyond the package's total. */
export const packageOverCompletionRule: Rule = {
  id: "package-over-completion",
  description: "A treatment's session number does not exceed its package total",
  defaultWeight: 1.5,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      for (const treatment of record.treatments) {
        if (treatment.sessionNumber == null || treatment.sessionsTotal == null) continue;
        if (treatment.sessionNumber > treatment.sessionsTotal) {
          results.push(
            fail(
              this.id,
              draft({
                category: "MISMATCHED_FIELD",
                severity: "HIGH",
                title: `Session beyond package total (${treatment.procedure}, ${record.patient.fullName})`,
                detail: `Session ${treatment.sessionNumber} of "${treatment.packageName ?? treatment.procedure}" exceeds the package total of ${treatment.sessionsTotal}, recorded on ${treatment.performedAt}.`,
                expectedValue: `sessionNumber <= ${treatment.sessionsTotal}`,
                actualValue: `${treatment.sessionNumber}`,
                evidence: [
                  crmEvidence(
                    record.patient.crmId,
                    `${treatment.procedure} session ${treatment.sessionNumber}/${treatment.sessionsTotal}`
                  ),
                ],
              })
            )
          );
        } else {
          results.push(pass(this.id));
        }
      }
    }
    return results;
  },
};

export const EXTENDED_RULES: Rule[] = [
  invoiceAfterTreatmentRule,
  invoiceWithoutTreatmentRule,
  duplicateInvoiceRule,
  duplicateTreatmentRule,
  impossibleSessionSequenceRule,
  impossiblePackageProgressionRule,
  repeatedEditsRule,
  suspiciousActivityFrequencyRule,
  staffMismatchRule,
  packageOverCompletionRule,
];
