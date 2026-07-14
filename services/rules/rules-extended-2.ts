import type { FindingDraft, FindingEvidence } from "@/lib/findings";
import type { NormalizedCrmPatientRecord } from "@/services/crm/types";
import { normalize } from "./similarity";
import type { Rule, RuleResult } from "./types";

/**
 * Seven more deterministic rules (M0052) — activity-integrity and
 * cross-record signals that the built-in thirteen (`rules.ts`) and the
 * M0047 ten (`rules-extended.ts`) do not cover. Same shape and style: pure,
 * synchronous, one FindingDraft per non-pass result. Registered alongside
 * BUILT_IN_RULES + EXTENDED_RULES in `createRuleEngine` (`rule-engine.ts`).
 *
 * Mapping of the M0052 spec categories to owners (no duplication):
 *  - Repeated edits              → EXISTING repeated-edits (M0047)
 *  - Suspicious editing frequency→ EXISTING suspicious-activity-frequency (M0047)
 *  - Treatment chronology        → EXISTING impossible-session-sequence (M0047)
 *  - Package abuse               → EXISTING impossible-package-progression / package-over-completion
 *  - Staff inconsistencies       → EXISTING staff-mismatch (M0047)
 *  - Invoice chronology          → NEW invoice-chronology-anomaly
 *  - Repeated cancellations      → NEW repeated-cancellations
 *  - Repeated deletions          → NEW repeated-deletions
 *  - Repeated invoice corrections→ NEW repeated-invoice-corrections
 *  - Unusual activity density    → NEW unusual-activity-density (bursts, distinct from total count)
 *  - Large billing adjustments   → NEW large-billing-adjustment
 *  - Cross-branch inconsistencies→ NEW cross-branch-inconsistency
 * See docs/MILESTONES/M0052.md for the full mapping rationale.
 */

type Activity = NormalizedCrmPatientRecord["activity"][number];

// ---------- local helpers (mirrored from rules.ts, which does not export them) ----------

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

/** Case-insensitive match of any keyword against an activity's logName + description. */
function activityMentions(event: Activity, keywords: readonly string[]): boolean {
  const haystack = `${normalize(event.logName)} ${normalize(event.description)}`;
  return keywords.some((keyword) => haystack.includes(keyword));
}

const MONEY_FIELDS = ["amount", "amount_paid", "amountpaid", "balance", "price", "total"] as const;

function isMoneyField(field: string): boolean {
  const f = normalize(field).replace(/\s+/g, "_");
  return MONEY_FIELDS.some((name) => f.includes(name));
}

/** Parse a possibly-formatted money string ("₱15,999.00", "15999") to a number, or null. */
function parseMoney(value: string | null | undefined): number | null {
  if (value == null) return null;
  const cleaned = value.replace(/[^\d.-]/g, "");
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number.parseFloat(cleaned);
}

/** Leading integer of a reference number ("INV-000123" → 123), or null. */
function refOrdinal(refNo: string): number | null {
  const match = refNo.match(/(\d+)/);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

const DELETION_KEYWORDS = ["delet", "removed", "request_for_deletion"] as const;
const CANCELLATION_KEYWORDS = ["cancel", "void", "refund"] as const;

// ---------- rules ----------

/** 1. Repeated cancellations: recurring cancel/void/refund activity on one patient. */
export const repeatedCancellationsRule: Rule = {
  id: "repeated-cancellations",
  description: "Recurring cancellation activity on one patient's records is flagged",
  defaultWeight: 2,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      const count = record.activity.filter((event) =>
        activityMentions(event, CANCELLATION_KEYWORDS)
      ).length;
      if (count >= context.config.repeatedCancellationsThreshold) {
        results.push(
          fail(
            this.id,
            draft({
              category: "RECORD_EDITED",
              severity: "HIGH",
              title: `Repeated cancellations for ${record.patient.fullName}`,
              detail: `${count} cancellation/void events were logged for this patient, at or above the threshold of ${context.config.repeatedCancellationsThreshold}. Repeated cancellations can mask reversed or re-billed services.`,
              recommendation: "Reconcile each cancellation against physical records and refunds.",
              expectedValue: `Fewer than ${context.config.repeatedCancellationsThreshold} cancellations`,
              actualValue: `${count} cancellations`,
              evidence: [crmEvidence(record.patient.crmId, `${count} cancellation events`)],
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

/** 2. Repeated deletions: recurring delete activity — destroyed evidence is a strong signal. */
export const repeatedDeletionsRule: Rule = {
  id: "repeated-deletions",
  description: "Recurring deletion activity on one patient's records is flagged",
  defaultWeight: 3,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      const count = record.activity.filter((event) =>
        activityMentions(event, DELETION_KEYWORDS)
      ).length;
      if (count >= context.config.repeatedDeletionsThreshold) {
        results.push(
          fail(
            this.id,
            draft({
              category: "RECORD_DELETED",
              severity: "CRITICAL",
              title: `Repeated deletions for ${record.patient.fullName}`,
              detail: `${count} deletion events were logged for this patient, at or above the threshold of ${context.config.repeatedDeletionsThreshold}. Deleting records after the fact destroys audit evidence.`,
              recommendation: "Recover the deleted records and verify each deletion was authorized.",
              expectedValue: `Fewer than ${context.config.repeatedDeletionsThreshold} deletions`,
              actualValue: `${count} deletions`,
              evidence: [crmEvidence(record.patient.crmId, `${count} deletion events`)],
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

/** 3. Repeated invoice corrections: recurring money-field edits on invoices/payments. */
export const repeatedInvoiceCorrectionsRule: Rule = {
  id: "repeated-invoice-corrections",
  description: "Recurring money-field edits to invoices/payments are flagged",
  defaultWeight: 2,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      const count = record.activity.filter((event) => {
        const invoiceScoped = activityMentions(event, ["invoice", "payment"]);
        if (!invoiceScoped) return false;
        // A money field changed (preferred signal), or a bare invoice/payment update.
        const moneyChanged = (event.changes ?? []).some((change) => isMoneyField(change.field));
        return moneyChanged || activityMentions(event, ["updated", "corrected", "edited"]);
      }).length;
      if (count >= context.config.repeatedInvoiceCorrectionsThreshold) {
        results.push(
          warn(
            this.id,
            draft({
              category: "RECORD_EDITED",
              severity: "HIGH",
              title: `Repeated invoice corrections for ${record.patient.fullName}`,
              detail: `${count} invoice/payment correction events were logged for this patient, at or above the threshold of ${context.config.repeatedInvoiceCorrectionsThreshold}. Repeated billing edits warrant reconciliation.`,
              recommendation: "Reconcile the invoice's edit history against payments received.",
              expectedValue: `Fewer than ${context.config.repeatedInvoiceCorrectionsThreshold} corrections`,
              actualValue: `${count} corrections`,
              evidence: [crmEvidence(record.patient.crmId, `${count} invoice correction events`)],
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

/** 4. Large billing adjustment: a single edited money field moved by a large amount. */
export const largeBillingAdjustmentRule: Rule = {
  id: "large-billing-adjustment",
  description: "A single money-field edit changing by a large amount is flagged",
  defaultWeight: 2,
  evaluate(context) {
    const results: RuleResult[] = [];
    const threshold = context.config.largeBillingAdjustmentAmount;
    for (const record of context.crmRecords) {
      let flagged = false;
      for (const event of record.activity) {
        for (const change of event.changes ?? []) {
          if (!isMoneyField(change.field)) continue;
          const oldValue = parseMoney(change.oldValue);
          const newValue = parseMoney(change.newValue);
          if (oldValue === null || newValue === null) continue;
          const delta = Math.abs(newValue - oldValue);
          if (delta >= threshold) {
            flagged = true;
            results.push(
              fail(
                this.id,
                draft({
                  category: "RECORD_EDITED",
                  severity: "HIGH",
                  title: `Large billing adjustment for ${record.patient.fullName}`,
                  detail: `The field "${change.field}" was changed from ${change.oldValue} to ${change.newValue} (Δ ${delta.toFixed(2)}) on ${event.occurredAt}, at or above the ${threshold} threshold.`,
                  recommendation: "Verify the adjustment's authorization and supporting documentation.",
                  expectedValue: `Adjustment under ${threshold}`,
                  actualValue: `Δ ${delta.toFixed(2)} (${change.oldValue} → ${change.newValue})`,
                  evidence: [
                    crmEvidence(
                      record.patient.crmId,
                      `${change.field}: ${change.oldValue} → ${change.newValue} on ${event.occurredAt}`
                    ),
                  ],
                })
              )
            );
          }
        }
      }
      if (!flagged) results.push(pass(this.id));
    }
    return results;
  },
};

/** 5. Unusual activity density: a burst of events within a single minute (distinct from total volume). */
export const unusualActivityDensityRule: Rule = {
  id: "unusual-activity-density",
  description: "A burst of activity within one minute is flagged (distinct from total volume)",
  defaultWeight: 1,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      const perMinute = new Map<string, number>();
      for (const event of record.activity) {
        const minute = event.occurredAt.slice(0, 16); // yyyy-mm-ddThh:mm
        perMinute.set(minute, (perMinute.get(minute) ?? 0) + 1);
      }
      let peak: { minute: string; count: number } | null = null;
      for (const [minute, count] of perMinute) {
        if (!peak || count > peak.count) peak = { minute, count };
      }
      if (peak && peak.count >= context.config.activityBurstThreshold) {
        results.push(
          warn(
            this.id,
            draft({
              category: "OTHER",
              severity: "MEDIUM",
              title: `Activity burst for ${record.patient.fullName}`,
              detail: `${peak.count} activity events landed within a single minute (${peak.minute}), at or above the burst threshold of ${context.config.activityBurstThreshold} — a signature of scripted or batched back-dated edits.`,
              expectedValue: `Fewer than ${context.config.activityBurstThreshold} events per minute`,
              actualValue: `${peak.count} events at ${peak.minute}`,
              evidence: [
                crmEvidence(record.patient.crmId, `${peak.count} events within ${peak.minute}`),
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

/** 6. Cross-branch inconsistency: one package spans branches, or same-day treatments at different branches. */
export const crossBranchInconsistencyRule: Rule = {
  id: "cross-branch-inconsistency",
  description: "One package's sessions, or one day's treatments, span multiple branches",
  defaultWeight: 1.5,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      const findings: string[] = [];

      // (a) A single package whose sessions span more than one branch.
      const packageBranches = new Map<string, Set<string>>();
      for (const treatment of record.treatments) {
        if (!treatment.packageName) continue;
        const set = packageBranches.get(treatment.packageName) ?? new Set<string>();
        set.add(treatment.branch.name || treatment.branch.crmBranchId);
        packageBranches.set(treatment.packageName, set);
      }
      for (const [packageName, branches] of packageBranches) {
        if (branches.size > 1) {
          findings.push(`package "${packageName}" spans ${[...branches].join(", ")}`);
        }
      }

      // (b) Same calendar day, different branches — one patient cannot be in two.
      const dayBranches = new Map<string, Set<string>>();
      for (const treatment of record.treatments) {
        const day = treatment.performedAt.slice(0, 10);
        const set = dayBranches.get(day) ?? new Set<string>();
        set.add(treatment.branch.name || treatment.branch.crmBranchId);
        dayBranches.set(day, set);
      }
      for (const [day, branches] of dayBranches) {
        if (branches.size > 1) {
          findings.push(`${day}: treatments at ${[...branches].join(", ")}`);
        }
      }

      if (findings.length > 0) {
        results.push(
          warn(
            this.id,
            draft({
              category: "MISMATCHED_FIELD",
              severity: "MEDIUM",
              title: `Cross-branch inconsistency for ${record.patient.fullName}`,
              detail: `Branch attribution is inconsistent: ${findings.join("; ")}. A package normally runs at one branch, and a patient cannot be treated at two branches the same day.`,
              expectedValue: "Consistent branch per package / per day",
              actualValue: findings.join("; "),
              evidence: [crmEvidence(record.patient.crmId, findings.join("; "))],
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

/** 7. Invoice chronology anomaly: reference numbers should not run counter to their dates. */
export const invoiceChronologyAnomalyRule: Rule = {
  id: "invoice-chronology-anomaly",
  description: "Invoice reference numbers increase with their dates (no backdated corrections)",
  defaultWeight: 1,
  evaluate(context) {
    const results: RuleResult[] = [];
    for (const record of context.crmRecords) {
      const ordered = record.invoices
        .map((invoice) => ({ invoice, ordinal: refOrdinal(invoice.refNo) }))
        .filter((entry): entry is { invoice: (typeof entry)["invoice"]; ordinal: number } =>
          entry.ordinal !== null
        )
        .sort((a, b) => a.ordinal - b.ordinal);

      let previous: { refNo: string; dateUpdated: string } | null = null;
      let anomaly: { refNo: string; dateUpdated: string } | null = null;
      for (const { invoice } of ordered) {
        if (previous && invoice.dateUpdated < previous.dateUpdated) {
          anomaly = { refNo: invoice.refNo, dateUpdated: invoice.dateUpdated };
          break;
        }
        previous = { refNo: invoice.refNo, dateUpdated: invoice.dateUpdated };
      }

      if (anomaly && previous) {
        results.push(
          warn(
            this.id,
            draft({
              category: "MISMATCHED_FIELD",
              severity: "MEDIUM",
              title: `Invoice chronology anomaly for ${record.patient.fullName}`,
              detail: `Invoice ${anomaly.refNo} is dated ${anomaly.dateUpdated}, earlier than the lower-numbered invoice ${previous.refNo} dated ${previous.dateUpdated}. A higher reference number with an earlier date suggests a backdated correction.`,
              expectedValue: `Invoice ${anomaly.refNo} dated on/after ${previous.dateUpdated}`,
              actualValue: `${anomaly.refNo} dated ${anomaly.dateUpdated}`,
              evidence: [
                crmEvidence(
                  record.patient.crmId,
                  `${anomaly.refNo} (${anomaly.dateUpdated}) < ${previous.refNo} (${previous.dateUpdated})`
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

export const EXTENDED_RULES_2: Rule[] = [
  repeatedCancellationsRule,
  repeatedDeletionsRule,
  repeatedInvoiceCorrectionsRule,
  largeBillingAdjustmentRule,
  unusualActivityDensityRule,
  crossBranchInconsistencyRule,
  invoiceChronologyAnomalyRule,
];
