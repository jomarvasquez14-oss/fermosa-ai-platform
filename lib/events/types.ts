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
  // Audit module (fire from the M2+ engine; catalogued now so contracts exist)
  "logbook.uploaded": { uploadId: string; branchId: string; uploadedById: string };
  "ocr.started": { uploadId: string; sessionId?: string };
  "ocr.completed": { uploadId: string; sessionId?: string; success: boolean };
  "crm.read.started": { sessionId: string; query: { branchCode?: string } };
  "crm.read.completed": { sessionId: string; recordCount: number; success: boolean };
  "matching.started": { sessionId: string };
  "matching.completed": { sessionId: string; matched: number; unmatched: number };
  "audit.completed": { sessionId: string; branchId: string };
  "audit.failed": { sessionId: string; branchId: string; step: string; reason: string };
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
