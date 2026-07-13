/**
 * Application event catalog.
 *
 * Names are `domain.action` (past tense for facts, `.started`/`.completed`
 * for phases). This is the closed, typed list of everything the platform can
 * announce — adding an event means adding it here, which type-checks every
 * publisher and subscriber.
 *
 * In-process only by design (see docs/DECISIONS.md ADR-018): no Kafka, no
 * RabbitMQ. If cross-process delivery is ever needed, the bus interface stays
 * and a transport is added behind it.
 */

/** Metadata attached to every published event by the bus. */
export interface EventEnvelope<TName extends AppEventName = AppEventName> {
  /** Unique id of this occurrence (for logs and idempotent handlers). */
  id: string;
  name: TName;
  occurredAt: Date;
  /** Correlates events belonging to one workflow (e.g. one audit session run). */
  correlationId?: string;
  payload: AppEventMap[TName];
}

/**
 * Event name → payload map. Payloads carry IDs, never entities —
 * subscribers load what they need through services.
 */
export interface AppEventMap {
  // Audit module (fire from the M2+ engine; catalogued now so contracts
  // exist). Terminology follows docs/DOMAIN_MODEL.md: submissions own images.
  "submission.submitted": { submissionId: string; branchId: string; submittedById: string };
  "logbook.image.stored": { imageId: string; submissionId: string; branchId: string };
  "ocr.started": { imageId: string; submissionId: string };
  "ocr.completed": { imageId: string; submissionId: string; success: boolean };
  "crm.read.started": { submissionId: string; query: { branchCode?: string } };
  "crm.read.completed": { submissionId: string; recordCount: number; success: boolean };
  "matching.started": { submissionId: string };
  "matching.completed": { submissionId: string; matched: number; unmatched: number };
  "audit.completed": { submissionId: string; branchId: string };
  "audit.failed": { submissionId: string; branchId: string; step: string; reason: string };
}

export type AppEventName = keyof AppEventMap;

export type EventHandler<TName extends AppEventName> = (
  event: EventEnvelope<TName>
) => void | Promise<void>;

export type Unsubscribe = () => void;

/**
 * Publish/subscribe contract. Depend on this interface, not on the concrete
 * bus, so the delivery mechanism can evolve without touching call sites.
 */
export interface EventBus {
  publish<TName extends AppEventName>(
    name: TName,
    payload: AppEventMap[TName],
    options?: { correlationId?: string }
  ): Promise<void>;

  subscribe<TName extends AppEventName>(name: TName, handler: EventHandler<TName>): Unsubscribe;
}
