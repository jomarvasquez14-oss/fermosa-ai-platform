import { InMemoryEventBus } from "@/lib/events/event-bus";
import type { EventBus } from "@/lib/events/types";

export * from "@/lib/events/types";
export { InMemoryEventBus } from "@/lib/events/event-bus";

/**
 * Application-wide event bus singleton. Survives dev hot-reload the same way
 * the Prisma client does (cached on globalThis) so subscriptions registered
 * at module scope are not duplicated on every recompile.
 */
const globalForEvents = globalThis as unknown as { appEvents?: EventBus };

export const appEvents: EventBus = globalForEvents.appEvents ?? new InMemoryEventBus();

if (process.env.NODE_ENV !== "production") {
  globalForEvents.appEvents = appEvents;
}
