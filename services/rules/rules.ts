import type { FindingDraft, FindingEvidence } from "@/lib/findings";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";
import { normalize, similarity } from "./similarity";
import type { ConfirmedEntry, Rule, RuleContext, RuleResult } from "./types";

/**
 * The twelve built-in rules (Sprint 3.7). Each is pure and deterministic;
 * each non-pass result carries a FindingDraft — findings ARE the output.
 * Adding a rule: new object here (or any module), register it. Nothing else.
 */

// ---------- shared helpers ----------

export const entryKey = (entry: ConfirmedEntry) => `${entry.pageNumber}:${entry.lineNumber}`;

function resolution(context: RuleContext, entry: ConfirmedEntry) {
  return context.resolutions.find((candidate) => candidate.entryKey === entryKey(entry));
}

function recordFor(context: RuleContext, crmPatientId: string | null) {
  return crmPatientId
    ? context.crmRecords.find((record) => record.patient.crmId === crmPatientId)
    : undefined;
}

/** Best same-day CRM treatment for an entry (by procedure similarity). */
function matchedTreatment(
  context: RuleContext,
  record: NormalizedCrmPatientRecord,
  entry: ConfirmedEntry
) {
  const sameDay = record.treatments.filter(
    (treatment) => treatment.performedAt === context.submission.auditDate
  );
  if (sameDay.length === 0 || !entry.treatment) return sameDay[0];
  return [...sameDay].sort(
    (a, b) => similarity(b.procedure, entry.treatment!) - similarity(a.procedure, entry.treatment!)
  )[0];
}

const fieldEvidence = (
  entry: ConfirmedEntry,
  field: "patientName" | "treatment" | "therapist" | "time" | null
): FindingEvidence => ({
  type: "logbook-field",
  imageId: entry.imageId,
  pageNumber: entry.pageNumber,
  lineNumber: entry.lineNumber,
  field,
});

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
function review(ruleId: string, finding: FindingDraft): RuleResult {
  return { ruleId, outcome: "review-required", finding };
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

// ---------- rules ----------

/** 1. Patient name: logbook name must match the resolved CRM patient. */
export const patientNameRule: Rule = {
  id: "patient-name",
  description: "Logbook patient name matches the resolved CRM patient",
  defaultWeight: 1,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const entry of context.entries) {
      const resolved = resolution(context, entry);
      const record = recordFor(context, resolved?.crmPatientId ?? null);
      if (!entry.patientName || !record) continue;
      const score = similarity(entry.patientName, record.patient.fullName);
      if (score >= context.config.nameSimilarityThreshold) {
        results.push(pass(this.id));
      } else {
        results.push(
          warn(
            this.id,
            draft({
              category: "MISMATCHED_FIELD",
              severity: "MEDIUM",
              title: `Patient name differs from CRM (line ${entry.lineNumber})`,
              detail: `The logbook reads “${entry.patientName}” but the matched CRM patient is “${record.patient.fullName}” (similarity ${score.toFixed(2)}).`,
              expectedValue: record.patient.fullName,
              actualValue: entry.patientName,
              evidence: [
                fieldEvidence(entry, "patientName"),
                crmEvidence(record.patient.crmId, "Matched patient profile"),
              ],
              confidence: score,
            })
          )
        );
      }
    }
    return results;
  },
};

/** 2. Treatment: the named procedure must exist on the CRM record that day. */
export const treatmentRule: Rule = {
  id: "treatment",
  description: "Logbook treatment matches a CRM treatment on the audit date",
  defaultWeight: 1.5,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const entry of context.entries) {
      const record = recordFor(context, resolution(context, entry)?.crmPatientId ?? null);
      if (!entry.treatment || !record) continue;
      const treatment = matchedTreatment(context, record, entry);
      if (!treatment) continue; // absence handled by missing-crm-record
      const score = similarity(treatment.procedure, entry.treatment);
      if (score >= context.config.nameSimilarityThreshold) {
        results.push(pass(this.id));
      } else {
        results.push(
          fail(
            this.id,
            draft({
              category: "MISMATCHED_FIELD",
              severity: "MEDIUM",
              title: `Treatment differs from CRM (line ${entry.lineNumber})`,
              detail: `Logbook says “${entry.treatment}”; the CRM's closest same-day record is “${treatment.procedure}”.`,
              expectedValue: treatment.procedure,
              actualValue: entry.treatment,
              evidence: [
                fieldEvidence(entry, "treatment"),
                crmEvidence(
                  record.patient.crmId,
                  `CRM treatment ${treatment.procedure} on ${treatment.performedAt}`
                ),
              ],
              confidence: score,
            })
          )
        );
      }
    }
    return results;
  },
};

/** 3. Therapist: performer attribution must agree (commissions depend on it). */
export const therapistRule: Rule = {
  id: "therapist",
  description: "Logbook therapist matches the CRM performer",
  defaultWeight: 1,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const entry of context.entries) {
      const record = recordFor(context, resolution(context, entry)?.crmPatientId ?? null);
      if (!entry.therapist || !record) continue;
      const treatment = matchedTreatment(context, record, entry);
      if (!treatment) continue;
      const score = similarity(treatment.performedBy.name, entry.therapist);
      if (score >= context.config.nameSimilarityThreshold) {
        results.push(pass(this.id));
      } else {
        results.push(
          warn(
            this.id,
            draft({
              category: "MISMATCHED_FIELD",
              severity: "MEDIUM",
              title: `Therapist differs from CRM (line ${entry.lineNumber})`,
              detail: `Logbook names “${entry.therapist}”; the CRM attributes the session to “${treatment.performedBy.name}”. Commission points follow the CRM attribution.`,
              expectedValue: treatment.performedBy.name,
              actualValue: entry.therapist,
              evidence: [
                fieldEvidence(entry, "therapist"),
                crmEvidence(record.patient.crmId, `performed_by ${treatment.performedBy.name}`),
              ],
              confidence: score,
            })
          )
        );
      }
    }
    return results;
  },
};

/** 4. Invoice integrity: amount = paid + balance; paid status means zero balance. */
export const invoiceRule: Rule = {
  id: "invoice",
  description: "Invoice amounts are internally consistent",
  defaultWeight: 1.5,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      for (const invoice of record.invoices) {
        const amount = Number(invoice.amount);
        const paid = Number(invoice.amountPaid);
        const balance = Number(invoice.balance);
        const arithmeticOk = Math.abs(amount - (paid + balance)) < 0.01;
        const statusOk = !(normalize(invoice.status) === "paid" && balance > 0.009);
        if (arithmeticOk && statusOk) {
          results.push(pass(this.id));
        } else {
          results.push(
            fail(
              this.id,
              draft({
                category: "MISMATCHED_FIELD",
                severity: "HIGH",
                title: `Invoice ${invoice.refNo} amounts are inconsistent`,
                detail: !arithmeticOk
                  ? `Amount ${invoice.amount} ≠ paid ${invoice.amountPaid} + balance ${invoice.balance}.`
                  : `Status is “${invoice.status}” but a balance of ${invoice.balance} remains.`,
                expectedValue: `amount = paid + balance (${invoice.amount})`,
                actualValue: `${invoice.amountPaid} + ${invoice.balance}`,
                evidence: [
                  crmEvidence(
                    record.patient.crmId,
                    `Invoice ${invoice.refNo} (${invoice.serviceName})`
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

/** 5. Payment: recorded payments must sum to the amount paid. */
export const paymentRule: Rule = {
  id: "payment",
  description: "Payment records sum to the invoice's amount paid",
  defaultWeight: 1.5,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      for (const invoice of record.invoices) {
        if (!invoice.payments) continue;
        const sum = invoice.payments.reduce((total, payment) => total + Number(payment.amount), 0);
        if (Math.abs(sum - Number(invoice.amountPaid)) < 0.01) {
          results.push(pass(this.id));
        } else {
          results.push(
            fail(
              this.id,
              draft({
                category: "MISMATCHED_FIELD",
                severity: "HIGH",
                title: `Payments on invoice ${invoice.refNo} do not sum to amount paid`,
                detail: `Individual payments total ${sum.toFixed(2)} but the invoice records amount paid ${invoice.amountPaid}. Unaccounted differences can indicate unremitted cash.`,
                expectedValue: invoice.amountPaid,
                actualValue: sum.toFixed(2),
                evidence: [
                  crmEvidence(record.patient.crmId, `Invoice ${invoice.refNo} payment records`),
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

/** 6. Branch: treatments must belong to the submitting branch. */
export const branchRule: Rule = {
  id: "branch",
  description: "CRM treatments on the audit date belong to the submitting branch",
  defaultWeight: 1,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      for (const treatment of record.treatments) {
        if (treatment.performedAt !== context.submission.auditDate) continue;
        if (similarity(treatment.branch.name, context.submission.branchName) >= 0.8) {
          results.push(pass(this.id));
        } else {
          results.push(
            warn(
              this.id,
              draft({
                category: "MISMATCHED_FIELD",
                severity: "MEDIUM",
                title: "Treatment recorded under a different branch",
                detail: `A same-day treatment for this patient is encoded under “${treatment.branch.name}”, not “${context.submission.branchName}”.`,
                expectedValue: context.submission.branchName,
                actualValue: treatment.branch.name,
                evidence: [
                  crmEvidence(
                    record.patient.crmId,
                    `${treatment.procedure} @ ${treatment.branch.name}`
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

/** 7. Date: matched treatments should carry the audit date. */
export const dateRule: Rule = {
  id: "date",
  description: "Matched CRM treatments are dated on the audit date",
  defaultWeight: 1,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const entry of context.entries) {
      const record = recordFor(context, resolution(context, entry)?.crmPatientId ?? null);
      if (!record || !entry.treatment) continue;
      const anyDay = record.treatments.filter(
        (treatment) =>
          similarity(treatment.procedure, entry.treatment!) >=
          context.config.nameSimilarityThreshold
      );
      if (anyDay.length === 0) continue;
      const onDate = anyDay.some(
        (treatment) => treatment.performedAt === context.submission.auditDate
      );
      if (onDate) {
        results.push(pass(this.id));
      } else {
        results.push(
          warn(
            this.id,
            draft({
              category: "MISMATCHED_FIELD",
              severity: "LOW",
              title: `Treatment dated differently in the CRM (line ${entry.lineNumber})`,
              detail: `“${entry.treatment}” exists for this patient but on ${anyDay[0]!.performedAt}, not the audit date ${context.submission.auditDate}. Late encoding or wrong logbook date.`,
              expectedValue: context.submission.auditDate,
              actualValue: anyDay[0]!.performedAt,
              evidence: [
                fieldEvidence(entry, "treatment"),
                crmEvidence(
                  record.patient.crmId,
                  `${anyDay[0]!.procedure} on ${anyDay[0]!.performedAt}`
                ),
              ],
            })
          )
        );
      }
    }
    return results;
  },
};

/** 8. Duplicate patient resolution: ambiguity must be resolved by a human. */
export const duplicatePatientRule: Rule = {
  id: "duplicate-patient",
  description: "Ambiguous CRM patient matches are surfaced for disambiguation",
  defaultWeight: 1,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const entry of context.entries) {
      const resolved = resolution(context, entry);
      if (resolved?.outcome !== "ambiguous") continue;
      results.push(
        review(
          this.id,
          draft({
            category: "AMBIGUOUS_PATIENT",
            severity: "MEDIUM",
            title: `Multiple CRM patients match “${entry.patientName}” (line ${entry.lineNumber})`,
            detail: `CRM lookup returned ${resolved.candidateIds?.length ?? "multiple"} candidates. Matching cannot proceed for this entry until a human picks.`,
            expectedValue: null,
            actualValue: null,
            evidence: [
              fieldEvidence(entry, "patientName"),
              {
                type: "note",
                text: `Candidates: ${resolved.candidateIds?.join(", ") ?? "unknown"}`,
              },
            ],
          })
        )
      );
    }
    return results;
  },
};

/** 9. Deleted treatment: CRM activity shows a deletion in the window. */
export const deletedTreatmentRule: Rule = {
  id: "deleted-treatment",
  description: "CRM records deleted around the audit date are flagged",
  defaultWeight: 2,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      for (const event of record.activity) {
        if (normalize(event.logName) !== "deleted") continue;
        results.push(
          fail(
            this.id,
            draft({
              category: "RECORD_DELETED",
              severity: "CRITICAL",
              title: "CRM record deleted after encoding",
              detail: `The CRM activity log shows “${event.description}” by ${event.causedBy} at ${event.occurredAt}. Deleted revenue records are a tampering indicator.`,
              recommendation:
                "Escalate: request the deletion justification and cross-check the day's remittance.",
              expectedValue: "Record retained",
              actualValue: `Deleted ${event.occurredAt}`,
              evidence: [
                {
                  type: "crm-activity",
                  crmPatientId: record.patient.crmId,
                  occurredAt: event.occurredAt,
                  logName: event.logName,
                },
              ],
            })
          )
        );
      }
    }
    return results;
  },
};

/** 10. Edited treatment: money/service fields changed after the fact. */
export const editedTreatmentRule: Rule = {
  id: "edited-treatment",
  description: "Post-hoc edits to money or service fields are flagged",
  defaultWeight: 2,
  evaluate(context) {
    const results: RuleResult[] = [];
    const sensitive = ["amount_paid", "amount", "service.name", "status"];
    for (const record of context.crmRecords) {
      for (const event of record.activity) {
        if (normalize(event.logName) !== "updated" || !event.changes) continue;
        const hits = event.changes.filter((change) => sensitive.includes(change.field));
        if (hits.length === 0) continue;
        results.push(
          fail(
            this.id,
            draft({
              category: "RECORD_EDITED",
              severity: "HIGH",
              title: "CRM record edited after the fact",
              detail: `${event.causedBy} changed ${hits
                .map(
                  (change) =>
                    `${change.field}: ${change.oldValue ?? "∅"} → ${change.newValue ?? "∅"}`
                )
                .join("; ")} at ${event.occurredAt}.`,
              recommendation: "Compare the physical receipt against the edited values.",
              expectedValue: hits[0]!.oldValue,
              actualValue: hits[0]!.newValue,
              evidence: [
                {
                  type: "crm-activity",
                  crmPatientId: record.patient.crmId,
                  occurredAt: event.occurredAt,
                  logName: event.logName,
                },
              ],
            })
          )
        );
      }
    }
    return results;
  },
};

/** 11. Missing CRM record: logbook entry with no CRM trace. */
export const missingCrmRecordRule: Rule = {
  id: "missing-crm-record",
  description: "Every logbook entry has a CRM treatment on the audit date",
  defaultWeight: 2,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const entry of context.entries) {
      if (!entry.patientName) continue;
      const resolved = resolution(context, entry);
      if (resolved?.outcome === "ambiguous") continue; // rule 8 owns this
      if (resolved?.outcome === "not-found" || !resolved) {
        results.push(
          fail(
            this.id,
            draft({
              category: "UNMATCHED_PATIENT",
              severity: "MEDIUM",
              title: `Logbook patient not found in the CRM (line ${entry.lineNumber})`,
              detail: `No CRM patient matched “${entry.patientName}”. Either an unregistered walk-in or a mis-read name.`,
              recommendation:
                "Verify the name against the page image; if correct, treat as unregistered.",
              expectedValue: "Registered CRM patient",
              actualValue: `No match for “${entry.patientName}”`,
              evidence: [fieldEvidence(entry, "patientName")],
            })
          )
        );
        continue;
      }
      const record = recordFor(context, resolved.crmPatientId);
      const sameDay = record?.treatments.some(
        (treatment) => treatment.performedAt === context.submission.auditDate
      );
      if (sameDay) {
        results.push(pass(this.id));
      } else {
        results.push(
          fail(
            this.id,
            draft({
              category: "MISSING_IN_CRM",
              severity: "CRITICAL",
              title: `Logbook treatment has no CRM record (line ${entry.lineNumber})`,
              detail: `The logbook records “${entry.treatment ?? "a treatment"}” for ${entry.patientName}, but the CRM has no treatment for this patient on ${context.submission.auditDate}. Possible unrecorded sale.`,
              recommendation:
                "Ask the branch to explain; if performed, it must be encoded and invoiced retroactively.",
              expectedValue: `CRM treatment on ${context.submission.auditDate}`,
              actualValue: "No CRM record",
              evidence: [
                fieldEvidence(entry, null),
                ...(record
                  ? [crmEvidence(record.patient.crmId, "Profile shows no same-day treatments")]
                  : []),
              ],
            })
          )
        );
      }
    }
    return results;
  },
};

/** 12. Missing invoice: encoded treatment with no invoice. */
export const missingInvoiceRule: Rule = {
  id: "missing-invoice",
  description: "Every same-day CRM treatment has an invoice",
  defaultWeight: 1.5,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      for (const treatment of record.treatments) {
        if (treatment.performedAt !== context.submission.auditDate) continue;
        const invoiced = record.invoices.some(
          (invoice) =>
            similarity(invoice.serviceName, treatment.packageName ?? treatment.procedure) >= 0.6
        );
        if (invoiced) {
          results.push(pass(this.id));
        } else {
          results.push(
            fail(
              this.id,
              draft({
                category: "MISSING_INVOICE",
                severity: "HIGH",
                title: `Treatment encoded but never invoiced (${treatment.procedure})`,
                detail: `The CRM shows ${treatment.procedure} on ${treatment.performedAt} for ${record.patient.fullName}, but no matching invoice exists. Invoices are generated after treatment encoding — a treatment without one means unbilled revenue.`,
                recommendation:
                  "Generate the missing invoice or document why the treatment was free.",
                expectedValue: `Invoice for ${treatment.procedure}`,
                actualValue: "No invoice on record",
                evidence: [
                  crmEvidence(
                    record.patient.crmId,
                    `${treatment.procedure} on ${treatment.performedAt}, empty invoice match`
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

/** Bonus, cheap and valuable: identical logbook lines. */
export const duplicateEntryRule: Rule = {
  id: "duplicate-entry",
  description: "Identical logbook lines are flagged as duplicates",
  defaultWeight: 0.5,
  evaluate(context) {
    const seen = new Map<string, ConfirmedEntry>();
    const results: RuleResult[] = [];
    for (const entry of context.entries) {
      if (!entry.patientName || !entry.treatment) continue;
      const key = normalize(`${entry.patientName}|${entry.treatment}|${entry.time ?? ""}`);
      const first = seen.get(key);
      if (!first) {
        seen.set(key, entry);
        continue;
      }
      results.push(
        warn(
          this.id,
          draft({
            category: "DUPLICATE_ENTRY",
            severity: "LOW",
            title: `Same session recorded twice (lines ${first.lineNumber} and ${entry.lineNumber})`,
            detail: `Two logbook lines record ${entry.patientName} / ${entry.treatment} at the same time.`,
            expectedValue: "One logbook entry",
            actualValue: "Duplicate entries",
            evidence: [fieldEvidence(first, null), fieldEvidence(entry, null)],
          })
        )
      );
    }
    return results;
  },
};

export const BUILT_IN_RULES: Rule[] = [
  patientNameRule,
  treatmentRule,
  therapistRule,
  invoiceRule,
  paymentRule,
  branchRule,
  dateRule,
  duplicatePatientRule,
  deletedTreatmentRule,
  editedTreatmentRule,
  missingCrmRecordRule,
  missingInvoiceRule,
  duplicateEntryRule,
];
