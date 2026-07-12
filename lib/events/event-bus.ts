import { logger } from "@/lib/logger";
import type {
  AppEventMap,
  AppEventName,
  EventBus,
  EventEnvelope,
  EventHandler,
  Unsubscribe,
} from "@/lib/events/types";

/**
 * In-process event bus.
 *
 * Delivery semantics (deliberately simple for an internal monolith):
 *  - handlers run sequentially, awaited, in subscription order;
 *  - a throwing handler is logged and isolated — it never breaks the
 *    publisher or the other handlers;
 *  - no persistence, no replay: events die with the process. Workflow STATE
 *    must live in the database (the audit pipeline persists step results);
 *    events are notifications, not the source of truth.
 */
export class InMemoryEventBus implements EventBus {
  private handlers = new Map<AppEventName, Set<EventHandler<AppEventName>>>();

  async publish<TName extends AppEventName>(
    name: TName,
    payload: AppEventMap[TName],
    options?: { correlationId?: string }
  ): Promise<void> {
    const envelope: EventEnvelope<TName> = {
      id: crypto.randomUUID(),
      name,
      occurredAt: new Date(),
      correlationId: options?.correlationId,
      payload,
    };

    logger.debug(`Event published: ${name}`, {
      eventId: envelope.id,
      correlationId: envelope.correlationId,
    });

    const subscribers = this.handlers.get(name);
    if (!subscribers) return;

    for (const handler of subscribers) {
      try {
        await handler(envelope as EventEnvelope<AppEventName>);
      } catch (error) {
        logger.error(`Event handler failed for ${name}`, {
          eventId: envelope.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  subscribe<TName extends AppEventName>(name: TName, handler: EventHandler<TName>): Unsubscribe {
    const set = this.handlers.get(name) ?? new Set();
    set.add(handler as EventHandler<AppEventName>);
    this.handlers.set(name, set);

    return () => {
      set.delete(handler as EventHandler<AppEventName>);
    };
  }
}
