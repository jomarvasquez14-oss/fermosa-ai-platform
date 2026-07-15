/**
 * Operational analytics models (M0055). Built by PURE functions
 * (`analytics-builder.ts`) from STORED evidence snapshot records — the
 * `NormalizedCrmPatientRecord`s the platform already sealed (ADR-035). The live
 * CRM is never queried here; analytics reads history, not the source system.
 */

export interface AnalyticsDatum {
  label: string;
  value: number;
}

export interface BranchComparisonRow {
  branch: string;
  treatments: number;
  patients: number;
}

export interface AnalyticsModel {
  /** How many snapshot records fed this view (0 → honest empty state). */
  snapshotCount: number;
  patientCount: number;
  /** Treatment volume by branch, most active first. */
  topBranches: AnalyticsDatum[];
  /** Treatment counts by procedure, most frequent first (top 10). */
  treatmentFrequency: AnalyticsDatum[];
  /** Pesos PAID per month (invoice amountPaid by dateUpdated), chronological. */
  revenueTrends: AnalyticsDatum[];
  /** Total pesos paid across all snapshots, as a 2-dp decimal string. */
  totalRevenuePaid: string;
  packageCompletion: {
    packages: number;
    completed: number;
    inProgress: number;
    /** Mean completion percent across packages, or null when there are none. */
    averagePercent: number | null;
  };
  /** Treatments by performing staff name, most active first (top 10). */
  staffActivity: AnalyticsDatum[];
  /**
   * Treatments by `performedBy.role`. The normalized contract only carries
   * aesthetician / encoder / unknown — finer roles (salesperson, IV therapist)
   * are not in the record, so "unknown" is bucketed honestly, never guessed.
   */
  staffByRole: AnalyticsDatum[];
  /** Activity edit volume by target type (treatment / invoice / payment / …). */
  editActivityByTarget: AnalyticsDatum[];
  branchComparison: BranchComparisonRow[];
}
