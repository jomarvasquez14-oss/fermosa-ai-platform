/** Review-state types for the OCR review kit (Sprint 3.3). */

export const REVIEW_FIELD_KEYS = ["patientName", "treatment", "therapist", "time"] as const;
export type ReviewFieldKey = (typeof REVIEW_FIELD_KEYS)[number];

export const REVIEW_FIELD_LABELS: Record<ReviewFieldKey, string> = {
  patientName: "Patient",
  treatment: "Treatment",
  therapist: "Therapist",
  time: "Time",
};

/**
 * How a field stands in the review:
 *  - pending      awaiting a decision (starts here unless auto-accepted)
 *  - accepted     reviewer accepted the OCR value as-is
 *  - edited       reviewer corrected the value (correction kept alongside original)
 *  - unreadable   reviewer confirmed the handwriting cannot be read
 */
export type FieldReviewStatus = "pending" | "accepted" | "edited" | "unreadable";

export interface ReviewField {
  key: ReviewFieldKey;
  /** What OCR extracted (null = model could not read it). Never mutated. */
  originalValue: string | null;
  /** Current value — the correction when status is "edited". */
  value: string | null;
  confidence: number;
  /** Model-reported unreadable flag (distinct from the reviewer's verdict). */
  modelUnreadable: boolean;
  status: FieldReviewStatus;
}

export interface ReviewEntry {
  lineNumber: number;
  fields: Record<ReviewFieldKey, ReviewField>;
}

export interface ReviewPage {
  /** LogbookImage id — used for the authenticated image URL. */
  imageId: string;
  pageNumber: number;
  fileName: string;
  pageConfidence: number;
  notes: string | null;
  unreadableRegions: Array<{ lineNumber: number | null; reason: string }>;
  entries: ReviewEntry[];
  confirmed: boolean;
}
